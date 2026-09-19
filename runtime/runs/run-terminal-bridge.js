"use strict";

const { resolveRunContext } = require("./run-context");

const MAX_BUFFERED_CHARACTERS = 100_000;

function nonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value;
}

/**
 * Correlates daemon-owned terminal/provider output with a Run. Rendering
 * subscribers are observers only: removing every listener never owns or stops
 * the underlying process. Input is a separate, per-run opt-in operation.
 */
class RunTerminalBridge {
  constructor({ app, store, terminals, terminalSessions, graphs } = {}) {
    if (!app || typeof app.subscribe !== "function" || typeof app.record !== "function") throw new TypeError("app is required");
    if (!store) throw new TypeError("store is required");
    if (!terminals) throw new TypeError("terminals is required");
    if (!terminalSessions) throw new TypeError("terminalSessions is required");
    this.app = app;
    this.store = store;
    this.terminals = terminals;
    this.terminalSessions = terminalSessions;
    this.graphs = graphs;
    this.bindings = new Map();
    this.runByTerminal = new Map();
    this.listeners = new Map();
    this.streams = new Map();
    this.processing = new Map();
    this.unsubscribeApp = app.subscribe((event) => this._onEvent(event));
  }

  async attach(request = {}) {
    const runId = nonEmptyString(request.runId, "runId");
    const projectId = nonEmptyString(request.projectId, "projectId");
    const workspacePath = nonEmptyString(request.workspacePath, "workspacePath");
    const command = nonEmptyString(request.command, "command");
    const args = request.args || [];
    if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new TypeError("args must be an array of strings");
    const run = await this.store.getRun(runId);
    if (!run) throw new Error(`run not found: ${runId}`);

    const ptyAvailable = Boolean(this.terminalSessions.ptySessions?.available?.());
    const terminal = ptyAvailable
      ? await this.terminalSessions.create({
        projectId, workspacePath, command, args, backend: "pty",
        kind: request.providerId ? "agent" : "shell", providerId: request.providerId,
        missionId: request.missionId
      })
      : await this.terminals.start({ projectId, cwd: workspacePath, command, args });
    const backend = ptyAvailable ? "pty" : "managed";
    const binding = { runId, terminalId: terminal.id, backend };
    this.bindings.set(runId, binding);
    this.runByTerminal.set(terminal.id, runId);
    await this.store.saveRun({
      ...run,
      metadata: { ...(run.metadata || {}), terminalId: terminal.id, interactive: request.interactive === true }
    });
    await this.app.record(null, "run.attachPty", { runId, terminalId: terminal.id, backend });

    return { terminalId: terminal.id, backend };
  }

  subscribe(runId, listener) {
    nonEmptyString(runId, "runId");
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    let listeners = this.listeners.get(runId);
    if (!listeners) { listeners = new Set(); this.listeners.set(runId, listeners); }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(runId);
    };
  }

  async snapshot(runId, afterSequence = 0) {
    nonEmptyString(runId, "runId");
    const validAfter = Number.isInteger(afterSequence) && afterSequence >= 0 ? afterSequence : 0;
    const binding = await this._binding(runId);
    if (!binding) return null;
    if (binding.backend === "pty") return this.terminalSessions.snapshot(binding.terminalId, validAfter);
    const stream = await this._stream(runId);
    return {
      runId,
      terminalId: binding.terminalId,
      sequence: stream.sequence,
      deltaAnsi: stream.chunks.filter((entry) => entry.sequence > validAfter).map((entry) => entry.chunk).join(""),
      ansi: stream.chunks.map((entry) => entry.chunk).join("")
    };
  }

  async input(runId, data) {
    nonEmptyString(runId, "runId");
    if (typeof data !== "string") throw new TypeError("data must be a string");
    const run = await this.store.getRun(runId);
    if (run?.metadata?.interactive !== true) return { granted: false };
    const binding = await this._binding(runId);
    if (!binding) return { granted: false };
    const delivered = binding.backend === "pty"
      ? await this.terminalSessions.input(binding.terminalId, data)
      : await this.terminals.sendInput(binding.terminalId, data);
    return { granted: Boolean(delivered) };
  }

  _onEvent(event) {
    if (!event || typeof event !== "object") return;
    if (event.type === "terminal.output" || event.type === "agentSession.output") {
      const terminalId = event.data?.terminalId;
      const runId = this.runByTerminal.get(terminalId);
      if (!runId) return;
      this._queue(runId, () => this._consumeTerminalEvent(runId, event));
      return;
    }
    if (event.type === "provider.output" && event.runId && typeof event.data?.chunk === "string") {
      this._queue(event.runId, () => this._publish(event.runId, event.data.chunk));
    }
    // Durable output snapshot is persisted daemon-side by MaestroApplication
    // at execution completion (single bounded write). The bridge stays
    // ephemeral for live fan-out; replay reads the snapshot via _stream.
  }

  _queue(runId, operation) {
    const previous = this.processing.get(runId) || Promise.resolve();
    const next = previous.then(operation);
    this.processing.set(runId, next.catch(() => {}));
    return next;
  }

  async _consumeTerminalEvent(runId, event) {
    if (event.type === "terminal.output") return this._publish(runId, event.data.chunk);
    const binding = await this._binding(runId);
    const stream = await this._stream(runId);
    const snapshot = await this.terminalSessions.snapshot(binding.terminalId, stream.ptySequence || 0);
    if (!snapshot) return;
    stream.ptySequence = snapshot.sequence;
    if (snapshot.deltaAnsi) await this._publish(runId, snapshot.deltaAnsi);
  }

  async _publish(runId, chunk) {
    if (typeof chunk !== "string" || chunk.length === 0) return;
    const stream = await this._stream(runId);
    stream.sequence += 1;
    stream.chunks.push({ sequence: stream.sequence, chunk });
    stream.characters += chunk.length;
    while (stream.characters > MAX_BUFFERED_CHARACTERS && stream.chunks.length > 1) {
      stream.characters -= stream.chunks.shift().chunk.length;
    }
    const context = await this._context(runId);
    const output = { runId, chunk, sequence: stream.sequence, ...(context?.missionId ? { missionId: context.missionId } : {}) };
    // Ephemeral fan-out: live listeners get every chunk; durable store gets
    // a single bounded snapshot at completion (see _persistSnapshot).
    if (typeof this.app.publishEphemeral === "function") {
      this.app.publishEphemeral(runId, "run.output", output);
    } else {
      this.app.events.emit("event", { id: `ephemeral-${Date.now()}-${Math.random()}`, runId, type: "run.output", occurredAt: new Date().toISOString(), data: output });
    }
    for (const listener of this.listeners.get(runId) || []) {
      try { listener(output); } catch { /* An observer cannot break the daemon stream. */ }
    }
  }

  async _binding(runId) {
    const known = this.bindings.get(runId);
    if (known) return known;
    const run = await this.store.getRun(runId);
    let terminalId = run?.metadata?.terminalId;
    if (!terminalId && typeof this.store.listEvents === "function") {
      const events = await this.store.listEvents({});
      terminalId = events.slice().reverse().find((event) => event.type === "run.attachPty" && event.data?.runId === runId)?.data?.terminalId;
    }
    if (!terminalId) return null;
    const terminal = await this.store.getTerminal(terminalId);
    if (!terminal) return null;
    const binding = { runId, terminalId, backend: terminal.backend === "pty" ? "pty" : "managed" };
    this.bindings.set(runId, binding);
    this.runByTerminal.set(terminalId, runId);
    return binding;
  }

  async _stream(runId) {
    let stream = this.streams.get(runId);
    if (stream) return stream;
    // Live-process memory only: raw provider/terminal chunks are ephemeral by
    // design (privacy + write amplification). Legacy runs persisted before
    // the ephemeral contract still replay from per-chunk events below.
    const events = typeof this.store.listEvents === "function" ? await this.store.listEvents({ runId }) : [];
    const snapshot = events.filter((event) => event.type === "run.output.snapshot").at(-1);
    if (snapshot && typeof snapshot.data?.ansi === "string") {
      const ansi = snapshot.data.ansi;
      stream = { sequence: snapshot.data.sequence || 1, chunks: [{ sequence: snapshot.data.sequence || 1, chunk: ansi }], characters: snapshot.data.characters || ansi.length, ptySequence: 0 };
      this.streams.set(runId, stream);
      return stream;
    }
    const providerChunks = events.filter((event) => event.type === "provider.output" && typeof event.data?.chunk === "string")
      .map((event, index) => ({ sequence: index + 1, chunk: event.data.chunk }));
    const chunks = providerChunks.length > 0 ? providerChunks : events
      .filter((event) => event.type === "run.output" && typeof event.data?.chunk === "string")
      .map((event) => ({ sequence: event.data.sequence, chunk: event.data.chunk }))
      .filter((entry) => Number.isInteger(entry.sequence));
    stream = {
      sequence: chunks.reduce((maximum, entry) => Math.max(maximum, entry.sequence), 0),
      chunks,
      characters: chunks.reduce((total, entry) => total + entry.chunk.length, 0),
      ptySequence: 0
    };
    while (stream.characters > MAX_BUFFERED_CHARACTERS && stream.chunks.length > 1) stream.characters -= stream.chunks.shift().chunk.length;
    this.streams.set(runId, stream);
    return stream;
  }

  async _context(runId) {
    const run = await this.store.getRun(runId);
    if (!run?.taskId) return null;
    try { return await resolveRunContext({ store: this.store, graphs: this.graphs, semanticTaskId: run.taskId }); }
    catch { return null; }
  }
}

module.exports = { MAX_BUFFERED_CHARACTERS, RunTerminalBridge };
