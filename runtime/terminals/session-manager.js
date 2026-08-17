"use strict";

const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { PtySessionManager } = require("./pty-session-manager");

const SESSION_STATUSES = Object.freeze(["created", "starting", "running", "active", "completed", "exited", "failed", "closed", "detached", "disconnected"]);
const SESSION_KINDS = Object.freeze(["agent", "shell"]);
const SESSION_BACKENDS = Object.freeze(["pty", "tmux", "vscode"]);

function sessionId() { return `terminal-session-${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }

function shellQuote(value) {
  return `'${String(value).replace(/'/gu, "'\\\"'\\\"'")}'`;
}

function tmuxSessionName(projectId, id) {
  return `maestro-${projectId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(-16)}-${id.slice(-8)}`;
}

function commandForProvider(providerId) {
  const commands = {
    codex: { command: "codex", args: [] },
    claude: { command: "claude", args: [] },
    opencode: { command: "opencode", args: [] },
    agy: { command: "agy", args: [] }
  };
  return commands[providerId] || null;
}

class BackendUnavailableError extends Error {
  constructor(backend, message) {
    super(message || `Backend de terminal indisponível: ${backend}`);
    this.name = "BackendUnavailableError";
    this.code = "TERMINAL_BACKEND_UNAVAILABLE";
    this.backend = backend;
  }
}

class TmuxTerminalBackend {
  constructor({ executable = "tmux", spawnSyncFn = spawnSync, spawnFn = spawn } = {}) {
    this.id = "tmux";
    this.executable = executable;
    this.spawnSync = spawnSyncFn;
    this.spawn = spawnFn;
  }

  available() {
    const result = this.spawnSync(this.executable, ["-V"], { encoding: "utf8", shell: false });
    return !result.error && result.status === 0;
  }

  ensureAvailable() {
    if (!this.available()) throw new BackendUnavailableError("tmux", "tmux não está instalado ou não está disponível no PATH. Instale-o manualmente e tente novamente.");
  }

  create(session) {
    this.ensureAvailable();
    const commandLine = [session.command, ...session.args].map(shellQuote).join(" ");
    const result = this.spawnSync(this.executable, ["new-session", "-d", "-s", session.backendSessionId, "-c", session.workspacePath, commandLine], { encoding: "utf8", shell: false });
    if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || "Não foi possível criar a sessão tmux.");
  }

  exists(session) {
    const result = this.spawnSync(this.executable, ["has-session", "-t", session.backendSessionId], { encoding: "utf8", shell: false });
    return !result.error && result.status === 0;
  }

  attach(session) {
    this.ensureAvailable();
    return new Promise((resolve, reject) => {
      const environment = { ...process.env };
      if (!environment.TERM || environment.TERM === "dumb") environment.TERM = "xterm-256color";
      const child = this.spawn(this.executable, ["attach-session", "-t", session.backendSessionId], { stdio: "inherit", shell: false, env: environment });
      child.once("error", reject);
      child.once("exit", (code) => resolve(code === 0));
    });
  }

  close(session) {
    this.ensureAvailable();
    const result = this.spawnSync(this.executable, ["kill-session", "-t", session.backendSessionId], { encoding: "utf8", shell: false });
    return !result.error && result.status === 0;
  }
}

class VsCodeTerminalBackend {
  constructor() { this.id = "vscode"; }
  available() { return true; }
  create() { /* The VS Code extension owns the native terminal and rendering. */ }
  attach() { return false; }
  close() { return false; }
}

class TerminalSessionManager {
  constructor({ store, emitEvent, tmuxBackend, vscodeBackend, ptySessions } = {}) {
    if (!store) throw new TypeError("store is required");
    this.store = store;
    this.emitEvent = emitEvent || (async () => {});
    this.ptySessions = ptySessions || new PtySessionManager({ store, emitEvent: this.emitEvent });
    this.backends = new Map([
      ["tmux", tmuxBackend || new TmuxTerminalBackend()],
      ["vscode", vscodeBackend || new VsCodeTerminalBackend()]
    ]);
  }

  capabilities() {
    const tmux = this.backends.get("tmux");
    const bun = spawnSync("bun", ["--version"], { encoding: "utf8", shell: false });
    let opentuiInstalled = false;
    try { require.resolve("@opentui/core"); opentuiInstalled = true; } catch { /* Optional dependency is absent. */ }
    return {
      backends: { pty: this.ptySessions.available(), tmux: Boolean(tmux?.available()), vscode: true },
      tui: { bun: !bun.error && bun.status === 0, opentui: opentuiInstalled },
      prerequisites: {
        pty: "Instale as ferramentas de compilação do sistema e execute `npm rebuild node-pty` para ativar terminais reais.",
        tmux: "tmux é mantido somente para sessões legadas e recuperação manual.",
        opentui: "Instale Bun manualmente e execute `bun install` no projeto para ativar a TUI visual OpenTUI."
      }
    };
  }

  async create(request) {
    const kind = request?.kind || "shell";
    const backendId = request?.backend || "pty";
    if (!SESSION_KINDS.includes(kind)) throw new TypeError("kind must be agent or shell");
    if (!SESSION_BACKENDS.includes(backendId)) throw new TypeError("backend must be pty, tmux, or vscode");
    if (typeof request?.projectId !== "string" || !request.projectId) throw new TypeError("projectId is required");
    if (typeof request?.workspacePath !== "string" || !request.workspacePath) throw new TypeError("workspacePath is required");
    const provider = kind === "agent" ? commandForProvider(request.providerId) : null;
    if (kind === "agent" && !provider && !request.command) {
      throw new TypeError("providerId must be one of codex, claude, opencode, or agy");
    }
    const command = request.command || provider?.command;
    const args = request.args || provider?.args || [];
    if (typeof command !== "string" || !command) throw new TypeError("command is required");
    if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) throw new TypeError("args must be an array of strings");
    if (kind === "agent" && !request.providerId) throw new TypeError("providerId is required for agent sessions");

    if (backendId === "pty") {
      const existingPty = (await this.store.listTerminals({ projectId: request.projectId, kind: "agent" }))
        .find((entry) => entry.backend === "pty" && ["starting", "active", "running"].includes(entry.status) && entry.workspacePath === request.workspacePath);
      if (kind === "agent" && existingPty) {
        const error = new Error(`Já existe uma sessão de agente ativa para este workspace: ${existingPty.id}`);
        error.code = "TERMINAL_WORKSPACE_LOCKED"; error.data = { terminalId: existingPty.id, workspacePath: existingPty.workspacePath }; throw error;
      }
      return this.ptySessions.create({ ...request, kind, command, args });
    }

    const existing = kind === "agent" ? await this.store.listTerminals({ projectId: request.projectId, kind: "agent" }) : [];
    const conflict = existing.find((entry) => ["created", "running", "detached"].includes(entry.status));
    if (conflict) {
      const error = new Error(`Já existe uma sessão de agente ativa para este workspace: ${conflict.id}`);
      error.code = "TERMINAL_WORKSPACE_LOCKED";
      error.data = { terminalId: conflict.id, workspacePath: conflict.workspacePath };
      throw error;
    }

    const id = sessionId();
    const backend = this.backends.get(backendId);
    if (!backend) throw new BackendUnavailableError(backendId);
    if (typeof backend.available !== "function" || !backend.available()) {
      throw new BackendUnavailableError(backendId, backendId === "tmux"
        ? "tmux não está instalado ou não está disponível no PATH. Instale-o manualmente e tente novamente."
        : `Backend de terminal indisponível: ${backendId}`);
    }
    const record = {
      id, projectId: request.projectId, label: request.label || (request.providerId || command), kind,
      providerId: request.providerId || undefined, backend: backendId, workspacePath: request.workspacePath,
      command, args, status: "created", createdAt: now(), startedAt: null, completedAt: null,
      backendSessionId: backendId === "tmux" ? tmuxSessionName(request.projectId, id) : undefined,
      presentation: request.presentation && typeof request.presentation === "object" ? request.presentation : {}
    };
    await this.store.saveTerminal(record);
    await this.emitEvent(null, "terminal.session_created", { terminalId: id, projectId: record.projectId, backend: backendId, kind });
    try {
      backend.create(record);
      const started = { ...record, status: "running", startedAt: now() };
      await this.store.saveTerminal(started);
      await this.emitEvent(null, "terminal.session_started", { terminalId: id, backend: backendId });
      return started;
    } catch (error) {
      await this.store.saveTerminal({ ...record, status: "failed", completedAt: now(), error: error.message });
      await this.emitEvent(null, "terminal.session_failed", { terminalId: id, backend: backendId, reason: error.code || "create_failed" });
      throw error;
    }
  }

  async list(filters = {}) {
    const sessions = await this.store.listTerminals(filters);
    // Registros do comando gerenciado legado não têm backend de sessão; eles
    // continuam preservados no store, mas não pertencem ao painel nativo.
    return Promise.all(sessions.filter((session) => SESSION_BACKENDS.includes(session.backend)).map((session) => this.refresh(session)));
  }

  async get(id) {
    const session = await this.store.getTerminal(id);
    return session ? this.refresh(session) : undefined;
  }

  async refresh(session) {
    if (session.backend === "pty") {
      if (["created", "starting", "running", "active"].includes(session.status) && !this.ptySessions.connected(session.id)) {
        const disconnected = { ...session, status: "disconnected", completedAt: session.completedAt || now(), notice: "O runtime proprietário desta PTY foi encerrado." };
        await this.store.saveTerminal(disconnected);
        await this.emitEvent(null, "agentSession.disconnected", { terminalId: session.id, backend: "pty" });
        return disconnected;
      }
      return session;
    }
    if (!SESSION_BACKENDS.includes(session.backend) || !["created", "running", "detached"].includes(session.status)) return session;
    if (session.backend === "tmux") {
      const backend = this.backends.get("tmux");
      if (backend.available() && !backend.exists(session)) {
        const exited = { ...session, status: "exited", completedAt: session.completedAt || now() };
        await this.store.saveTerminal(exited);
        await this.emitEvent(null, "terminal.session_disconnected", { terminalId: session.id, backend: "tmux" });
        return exited;
      }
    }
    if (session.backend === "vscode" && session.status === "running" && !session.clientId) {
      const detached = { ...session, status: "detached", detachedAt: now() };
      await this.store.saveTerminal(detached);
      await this.emitEvent(null, "terminal.session_disconnected", { terminalId: session.id, backend: "vscode" });
      return detached;
    }
    return session;
  }

  async attach(id) {
    const session = await this.get(id);
    if (!session) return false;
    if (session.backend === "pty") return this.focus(id);
    if (session.backend !== "tmux") throw new BackendUnavailableError("vscode", "Sessões VS Code são focadas pelo cliente VS Code, não pelo bridge.");
    if (session.status !== "running") return false;
    await this.emitEvent(null, "terminal.session_attached", { terminalId: id });
    return this.backends.get("tmux").attach(session);
  }

  async close(id) {
    const ptySession = await this.store.getTerminal(id);
    if (ptySession?.backend === "pty") return this.ptySessions.close(id);
    const session = await this.store.getTerminal(id);
    if (!session) return false;
    if (session.backend === "tmux" && ["created", "running", "detached"].includes(session.status)) {
      try { this.backends.get("tmux").close(session); } catch { /* The durable record can still be closed locally. */ }
    }
    const closed = { ...session, status: "closed", completedAt: now() };
    await this.store.saveTerminal(closed);
    await this.emitEvent(null, "terminal.session_closed", { terminalId: id, backend: session.backend });
    return true;
  }

  async registerClient({ terminalId, clientId, terminalName } = {}) {
    if (typeof terminalId !== "string" || !terminalId || typeof clientId !== "string" || !clientId) throw new TypeError("terminalId and clientId are required");
    const session = await this.store.getTerminal(terminalId);
    if (!session) return null;
    const updated = { ...session, clientId, clientTerminalName: terminalName || session.clientTerminalName, status: "running", startedAt: session.startedAt || now(), clientConnectedAt: now() };
    await this.store.saveTerminal(updated);
    await this.emitEvent(null, "terminal.client_registered", { terminalId, clientId });
    return updated;
  }

  async updateClientStatus({ terminalId, clientId, status } = {}) {
    if (typeof terminalId !== "string" || !terminalId || !SESSION_STATUSES.includes(status)) throw new TypeError("terminalId and a valid status are required");
    const session = await this.store.getTerminal(terminalId);
    if (!session) return null;
    if (clientId && session.clientId && clientId !== session.clientId) return null;
    const updated = { ...session, status, clientId: clientId || session.clientId, completedAt: ["closed", "exited", "failed"].includes(status) ? now() : session.completedAt };
    await this.store.saveTerminal(updated);
    await this.emitEvent(null, "terminal.client_status", { terminalId, status });
    return updated;
  }

  async input(id, data) { return this.ptySessions.input(id, data); }
  async resize(id, columns, rows) { return this.ptySessions.resize(id, columns, rows); }
  async focus(id) { return this.ptySessions.focus(id); }
  async snapshot(id, afterSequence = 0) { return this.ptySessions.snapshot(id, afterSequence); }
}

module.exports = { BackendUnavailableError, SESSION_BACKENDS, SESSION_KINDS, SESSION_STATUSES, TerminalSessionManager, TmuxTerminalBackend, VsCodeTerminalBackend, commandForProvider };
