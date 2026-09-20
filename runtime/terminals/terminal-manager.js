"use strict";

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { sanitizeTerminalError, toPersistedTerminalIdentity } = require("./terminal-persistence");

function terminalId() { return `terminal-${crypto.randomUUID()}`; }

const MAX_BUFFERED_OUTPUT_CHARS = 100_000;
const MAX_RETAINED_BUFFERS = 50;

/**
 * A deliberately small managed-command facility. It is not a terminal emulator
 * and it never invokes a shell: callers provide an executable and its arguments.
 * Live input/output exist only for the lifetime of the hosting Maestro process.
 *
 * Privacy contract: raw stdout/stderr live in bounded in-memory buffers and
 * are fanned out as ephemeral `terminal.output` events only. The durable
 * RunStore receives terminal metadata (status, exit code, sanitized command
 * identity) but never raw output, never raw argv, and never per-chunk writes.
 */
class TerminalManager {
  constructor({ store, emitEvent } = {}) {
    if (!store) throw new TypeError("store is required");
    this.store = store;
    this.emitEvent = emitEvent || (async () => {});
    this.active = new Map();
    this.writeQueues = new Map();
    this.completionPromises = new Map();
    this.buffers = new Map();
  }

  _bufferFor(id) {
    let buffer = this.buffers.get(id);
    if (!buffer) {
      buffer = { output: "", stderr: "" };
      this.buffers.set(id, buffer);
      while (this.buffers.size > MAX_RETAINED_BUFFERS) {
        const oldest = this.buffers.keys().next().value;
        if (oldest === id) break;
        this.buffers.delete(oldest);
      }
    }
    return buffer;
  }

  _withBufferedOutput(record, id) {
    const buffer = this.buffers.get(id);
    return {
      ...record,
      output: buffer ? buffer.output : "",
      stderr: buffer ? buffer.stderr : ""
    };
  }

  async finalizeTerminalCompletion({ id, settle, completionResolve, fallbackRecord, error }) {
    try {
      const final = await this.store.getTerminal(id);
      const completed = this._withBufferedOutput(final || fallbackRecord, id);
      settle(completed);
      completionResolve(completed);
    } catch {
      const fallback = this._withBufferedOutput({
        ...fallbackRecord,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error ? sanitizeTerminalError(error) : "terminal-finalization-failed"
      }, id);
      settle(fallback);
      completionResolve(fallback);
    } finally {
      this.completionPromises.delete(id);
    }
  }

  queueWrite(id, operation) {
    const previous = this.writeQueues.get(id) || Promise.resolve();
    const next = previous.then(operation);
    this.writeQueues.set(id, next.catch(() => {}));
    return next;
  }

  async start({ projectId, cwd, command, args = [] }) {
    if (typeof projectId !== "string" || !projectId) throw new TypeError("projectId is required");
    if (typeof cwd !== "string" || !cwd) throw new TypeError("cwd is required");
    if (typeof command !== "string" || !command) throw new TypeError("command is required");
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new TypeError("args must be an array of strings");
    const id = terminalId();
    const startedAt = new Date().toISOString();
    const persistedIdentity = toPersistedTerminalIdentity(command, args);
    const record = { kind: "terminal", id, projectId, cwd, ...persistedIdentity, status: "starting", startedAt, pid: null };
    await this.store.saveTerminal(record);
    this._bufferFor(id);
    let child;
    try {
      child = spawn(command, args, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      await this.store.saveTerminal({ ...record, status: "failed", completedAt: new Date().toISOString(), error: sanitizeTerminalError(error) });
      throw error;
    }
    const appendOutput = (stream, chunk) => {
      const buffer = this._bufferFor(id);
      const text = chunk.toString("utf8");
      buffer[stream] = `${buffer[stream] || ""}${text}`.slice(-MAX_BUFFERED_OUTPUT_CHARS);
      return this.emitEvent(null, "terminal.output", { terminalId: id, projectId: record.projectId, stream, chunk: text }).catch(() => {});
    };
    child.stdout.on("data", (chunk) => { appendOutput("output", chunk); });
    child.stderr.on("data", (chunk) => { appendOutput("stderr", chunk); });
    let settle;
    const finished = new Promise((resolve) => { settle = resolve; });
    let completionResolve;
    const completionPromise = new Promise((r) => { completionResolve = r; });
    this.completionPromises.set(id, completionPromise);
    child.on("error", async (error) => {
      try {
        await this.queueWrite(id, async () => {
          const current = await this.store.getTerminal(id);
          if (current) await this.store.saveTerminal({ ...current, status: "failed", completedAt: new Date().toISOString(), error: sanitizeTerminalError(error) });
        });
      } catch {}
      await this.finalizeTerminalCompletion({ id, settle, completionResolve, fallbackRecord: record, error });
    });
    child.on("close", async (exitCode, signal) => {
      this.active.delete(id);
      try {
        await this.queueWrite(id, async () => {
          const current = await this.store.getTerminal(id);
          if (current) await this.store.saveTerminal({ ...current, status: exitCode === 0 ? "completed" : "failed", exitCode, signal: signal || null, completedAt: new Date().toISOString() });
        });
        await this.emitEvent(null, "terminal.completed", { terminalId: id, projectId: record.projectId, exitCode, signal: signal || null });
      } catch {}
      await this.finalizeTerminalCompletion({ id, settle, completionResolve, fallbackRecord: { ...record, exitCode, signal } });
    });
    const active = { child, record, finished };
    this.active.set(id, active);
    const started = { ...record, status: "running", pid: child.pid || null };
    await this.store.saveTerminal(started);
    await this.emitEvent(null, "terminal.started", { terminalId: id, projectId, pid: child.pid || null });
    return started;
  }

  async stop(id) {
    const active = this.active.get(id);
    if (!active) return false;
    active.child.kill("SIGTERM");
    const killTimeout = setTimeout(() => { try { active.child.kill("SIGKILL"); } catch {} }, 5000);
    active.child.once("close", () => clearTimeout(killTimeout));
    return true;
  }

  async wait(id) {
    const active = this.active.get(id);
    if (active) return active.finished;
    const pending = this.completionPromises.get(id);
    if (pending) return pending;
    if (this.buffers.has(id)) {
      const stored = await this.store.getTerminal(id);
      if (stored) return this._withBufferedOutput(stored, id);
    }
    return this.store.getTerminal(id);
  }

  async sendInput(id, input) {
    if (typeof input !== "string") throw new TypeError("input must be a string");
    const active = this.active.get(id);
    if (!active || !active.child.stdin.writable) return false;
    active.child.stdin.write(input);
    return true;
  }
}

module.exports = { TerminalManager };
