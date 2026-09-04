"use strict";

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

function terminalId() { return `terminal-${crypto.randomUUID()}`; }

/**
 * A deliberately small managed-command facility. It is not a terminal emulator
 * and it never invokes a shell: callers provide an executable and its arguments.
 * Live input/output exist only for the lifetime of the hosting Maestro process.
 */
class TerminalManager {
  constructor({ store, emitEvent } = {}) {
    if (!store) throw new TypeError("store is required");
    this.store = store;
    this.emitEvent = emitEvent || (async () => {});
    this.active = new Map();
    this.writeQueues = new Map();
    this.completionPromises = new Map();
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
    const record = { kind: "terminal", id, projectId, cwd, command, args, status: "starting", startedAt, pid: null, output: "", stderr: "" };
    await this.store.saveTerminal(record);
    let child;
    try {
      child = spawn(command, args, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      await this.store.saveTerminal({ ...record, status: "failed", completedAt: new Date().toISOString(), error: error.message });
      throw error;
    }
    const persistOutput = (stream, chunk) => this.queueWrite(id, async () => {
      const current = await this.store.getTerminal(id);
      if (!current) return;
      const text = `${current[stream] || ""}${chunk.toString("utf8")}`.slice(-100000);
      await this.store.saveTerminal({ ...current, [stream]: text });
      await this.emitEvent(null, "terminal.output", { terminalId: id, projectId: record.projectId, stream, chunk: chunk.toString("utf8") });
    });
    child.stdout.on("data", (chunk) => { persistOutput("output", chunk).catch(() => {}); });
    child.stderr.on("data", (chunk) => { persistOutput("stderr", chunk).catch(() => {}); });
    let settle;
    const finished = new Promise((resolve) => { settle = resolve; });
    let completionResolve;
    const completionPromise = new Promise((r) => { completionResolve = r; });
    this.completionPromises.set(id, completionPromise);
    child.on("error", async (error) => {
      await this.queueWrite(id, async () => {
        const current = await this.store.getTerminal(id);
        if (current) await this.store.saveTerminal({ ...current, status: "failed", completedAt: new Date().toISOString(), error: error.message });
      });
      const final = await this.store.getTerminal(id);
      settle(final);
      this.completionPromises.delete(id);
      completionResolve(final);
    });
    child.on("close", async (exitCode, signal) => {
      this.active.delete(id);
      await this.queueWrite(id, async () => {
        const current = await this.store.getTerminal(id);
        if (current) await this.store.saveTerminal({ ...current, status: exitCode === 0 ? "completed" : "failed", exitCode, signal: signal || null, completedAt: new Date().toISOString() });
      });
      await this.emitEvent(null, "terminal.completed", { terminalId: id, projectId: record.projectId, exitCode, signal: signal || null });
      const final = await this.store.getTerminal(id);
      settle(final);
      this.completionPromises.delete(id);
      completionResolve(final);
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
    return true;
  }

  async wait(id) {
    const active = this.active.get(id);
    if (active) return active.finished;
    const pending = this.completionPromises.get(id);
    if (pending) return pending;
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
