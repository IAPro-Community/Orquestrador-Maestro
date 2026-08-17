"use strict";

const crypto = require("node:crypto");

const MAX_SCROLLBACK = 2_000;
const DEFAULT_COLUMNS = 100;
const DEFAULT_ROWS = 28;

function now() { return new Date().toISOString(); }
function id() { return `agent-session-${crypto.randomUUID()}`; }

function loadPty() {
  try { return require("node-pty"); } catch (error) {
    const unavailable = new Error("node-pty não está disponível. Instale as ferramentas de compilação do sistema e execute `npm rebuild node-pty`.");
    unavailable.code = "PTY_UNAVAILABLE";
    unavailable.cause = error;
    throw unavailable;
  }
}

function createBuffer(columns, rows) {
  let terminal;
  try {
    const { Terminal } = require("@xterm/headless");
    terminal = new Terminal({ cols: columns, rows, scrollback: MAX_SCROLLBACK, allowProposedApi: true });
  } catch { /* A PTY can still be useful when the optional screen model is unavailable. */ }
  const chunks = [];
  let sequence = 0;
  let bufferedCharacters = 0;
  return {
    write(data) {
      const text = String(data);
      sequence += 1;
      chunks.push({ sequence, data: text });
      bufferedCharacters += text.length;
      while (bufferedCharacters > 200_000 && chunks.length > 1) bufferedCharacters -= chunks.shift().data.length;
      if (terminal) terminal.write(text);
    },
    resize(nextColumns, nextRows) { if (terminal) terminal.resize(nextColumns, nextRows); },
    snapshot(afterSequence = 0) {
      const validSequence = Number.isInteger(afterSequence) && afterSequence >= 0 ? afterSequence : 0;
      const deltaAnsi = chunks.filter((chunk) => chunk.sequence > validSequence).map((chunk) => chunk.data).join("");
      const ansi = chunks.map((chunk) => chunk.data).join("");
      if (terminal) {
        const buffer = terminal.buffer.active;
        const start = Math.max(0, buffer.length - MAX_SCROLLBACK);
        const lines = [];
        for (let index = start; index < buffer.length; index += 1) lines.push(buffer.getLine(index)?.translateToString(true) || "");
        return { sequence, deltaAnsi, ansi, lines, cursor: { x: buffer.cursorX, y: buffer.cursorY }, scrollback: Math.max(0, buffer.length - rows) };
      }
      return { sequence, deltaAnsi, ansi, lines: ansi.split(/\r?\n/u).slice(-MAX_SCROLLBACK), cursor: { x: 0, y: 0 }, scrollback: 0 };
    },
    dispose() { terminal?.dispose(); }
  };
}

/**
 * Owns real pseudo terminals and deliberately keeps their screen contents only
 * in memory. The durable store receives session metadata/events, never input,
 * prompt text, ANSI output or scrollback.
 */
class PtySessionManager {
  constructor({ store, emitEvent, ptyModule } = {}) {
    if (!store) throw new TypeError("store is required");
    this.store = store;
    this.emitEvent = emitEvent || (async () => {});
    this.ptyModule = ptyModule;
    this.sessions = new Map();
  }

  available() {
    try { return Boolean(this.ptyModule || loadPty()); } catch { return false; }
  }

  connected(sessionId) { return this.sessions.has(sessionId); }

  async create(request = {}) {
    const pty = this.ptyModule || loadPty();
    for (const key of ["projectId", "workspacePath", "command"]) if (typeof request[key] !== "string" || !request[key]) throw new TypeError(`${key} is required`);
    const args = request.args || [];
    if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new TypeError("args must be an array of strings");
    const columns = Number.isInteger(request.columns) ? request.columns : DEFAULT_COLUMNS;
    const rows = Number.isInteger(request.rows) ? request.rows : DEFAULT_ROWS;
    const sessionId = request.sessionId || id();
    const record = {
      id: sessionId, projectId: request.projectId, missionId: request.missionId, label: request.label || request.providerId || request.command,
      kind: request.kind || "shell", providerId: request.providerId, backend: "pty", workspacePath: request.workspacePath,
      sourceWorkspacePath: request.sourceWorkspacePath, workspaceId: request.workspaceId, isolation: request.isolation || "shared", role: request.role,
      command: request.command, args, status: "starting", createdAt: now(), startedAt: null, completedAt: null,
      presentation: request.presentation && typeof request.presentation === "object" ? request.presentation : {}
    };
    await this.store.saveTerminal(record);
    await this.emitEvent(null, "agentSession.created", { terminalId: sessionId, projectId: record.projectId, backend: "pty" });
    try {
      const child = pty.spawn(record.command, args, { name: "xterm-256color", cols: columns, rows, cwd: record.workspacePath, env: { ...process.env, TERM: "xterm-256color" } });
      const buffer = createBuffer(columns, rows);
      const active = { child, buffer, columns, rows, focused: false, page: 0 };
      this.sessions.set(sessionId, active);
      child.onData((data) => { buffer.write(data); this.emitEvent(null, "agentSession.output", { terminalId: sessionId, bytes: Buffer.byteLength(data) }).catch(() => {}); });
      child.onExit(({ exitCode, signal }) => {
        this.sessions.delete(sessionId); buffer.dispose();
        this.store.getTerminal(sessionId).then((current) => current && this.store.saveTerminal({ ...current, status: exitCode === 0 ? "completed" : "failed", completedAt: now(), exitCode, signal })).catch(() => {});
        this.emitEvent(null, "agentSession.exited", { terminalId: sessionId, exitCode, signal }).catch(() => {});
      });
      const started = { ...record, status: "active", startedAt: now(), pid: child.pid };
      await this.store.saveTerminal(started);
      await this.emitEvent(null, "agentSession.active", { terminalId: sessionId, pid: child.pid });
      return started;
    } catch (error) {
      await this.store.saveTerminal({ ...record, status: "failed", completedAt: now(), error: error.message });
      throw error;
    }
  }

  async list(filters = {}) { return (await this.store.listTerminals(filters)).filter((entry) => entry.backend === "pty"); }
  async get(sessionId) { return this.store.getTerminal(sessionId); }
  async close(sessionId) {
    const active = this.sessions.get(sessionId);
    const stored = await this.store.getTerminal(sessionId);
    if (!stored) return false;
    if (active) { active.child.kill(); active.buffer.dispose(); this.sessions.delete(sessionId); }
    await this.store.saveTerminal({ ...stored, status: "closed", completedAt: now() });
    await this.emitEvent(null, "agentSession.closed", { terminalId: sessionId });
    return true;
  }
  async input(sessionId, data) {
    if (typeof data !== "string") throw new TypeError("data must be a string");
    const active = this.sessions.get(sessionId);
    if (!active) return false;
    active.child.write(data); return true;
  }
  async resize(sessionId, columns, rows) {
    const active = this.sessions.get(sessionId);
    if (!active) return false;
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2) throw new TypeError("columns and rows must be integers greater than one");
    active.columns = columns; active.rows = rows; active.child.resize(columns, rows); active.buffer.resize(columns, rows); return true;
  }
  async focus(sessionId) {
    for (const active of this.sessions.values()) active.focused = false;
    const active = this.sessions.get(sessionId); if (!active) return false;
    active.focused = true; return true;
  }
  async snapshot(sessionId, afterSequence = 0) {
    const session = await this.get(sessionId);
    if (!session) return null;
    const active = this.sessions.get(sessionId);
    return { session, connected: Boolean(active), columns: active?.columns || DEFAULT_COLUMNS, rows: active?.rows || DEFAULT_ROWS, focused: Boolean(active?.focused), ...(active?.buffer.snapshot(afterSequence) || { sequence: 0, deltaAnsi: "", ansi: "", lines: [], cursor: { x: 0, y: 0 }, scrollback: 0 }) };
  }
}

module.exports = { PtySessionManager, createBuffer, loadPty };
