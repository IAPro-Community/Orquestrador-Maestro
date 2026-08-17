"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { TerminalManager } = require("../terminal-manager");
const { BackendUnavailableError, TerminalSessionManager } = require("../session-manager");
const { EventEmitter } = require("node:events");

test("managed commands persist project-scoped output and real completion", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-terminal-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") }); await store.initialize();
  const manager = new TerminalManager({ store });
  const terminal = await manager.start({ projectId: "project-1", cwd: root, command: process.execPath, args: ["-e", "console.log('ok')"] });
  const completed = await manager.wait(terminal.id);
  assert.equal(completed.status, "completed");
  assert.match(completed.output, /ok/u);
  assert.equal((await store.listTerminals({ projectId: "project-1" })).length, 1);
});

test("native sessions persist without screen contents and lock writable agents per workspace", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-session-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") }); await store.initialize();
  const tmux = { available: () => true, create() {}, exists: () => true, close: () => true, attach: () => true };
  const manager = new TerminalSessionManager({ store, tmuxBackend: tmux });
  const first = await manager.create({ projectId: "project-1", workspacePath: root, kind: "agent", providerId: "codex", backend: "tmux" });
  assert.equal(first.status, "running");
  assert.equal(first.command, "codex");
  assert.equal(Object.hasOwn(first, "output"), false);
  await assert.rejects(
    () => manager.create({ projectId: "project-1", workspacePath: root, kind: "agent", providerId: "opencode", backend: "tmux" }),
    (error) => error.code === "TERMINAL_WORKSPACE_LOCKED" && error.data.terminalId === first.id
  );
  const shell = await manager.create({ projectId: "project-1", workspacePath: root, kind: "shell", command: "npm", args: ["test"], backend: "tmux" });
  assert.equal(shell.kind, "shell");
  assert.equal((await manager.list({ projectId: "project-1" })).length, 2);
});

test("native sessions expose dependency failures and detach stale VS Code sessions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-session-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") }); await store.initialize();
  const unavailable = new TerminalSessionManager({ store, tmuxBackend: { available: () => false } });
  await assert.rejects(
    () => unavailable.create({ projectId: "project-1", workspacePath: root, kind: "shell", command: "echo", backend: "tmux" }),
    (error) => error instanceof BackendUnavailableError && error.code === "TERMINAL_BACKEND_UNAVAILABLE"
  );
  const manager = new TerminalSessionManager({ store });
  const session = await manager.create({ projectId: "project-1", workspacePath: root, kind: "shell", command: "echo", backend: "vscode" });
  const detached = await manager.get(session.id);
  assert.equal(detached.status, "detached");
  const registered = await manager.registerClient({ terminalId: session.id, clientId: "vscode-test", terminalName: "Maestro · echo" });
  assert.equal(registered.status, "running");
});

test("tmux attach restores a usable terminal type when the parent reports dumb", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-session-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") }); await store.initialize();
  let received;
  const tmux = new (require("../session-manager").TmuxTerminalBackend)({
    spawnSyncFn: () => ({ status: 0 }),
    spawnFn: (_command, _args, options) => {
      received = options;
      const { EventEmitter } = require("node:events");
      const child = new EventEmitter();
      process.nextTick(() => child.emit("exit", 0));
      return child;
    }
  });
  const session = { backendSessionId: "maestro-test" };
  const previous = process.env.TERM;
  process.env.TERM = "dumb";
  try { assert.equal(await tmux.attach(session), true); } finally {
    if (previous === undefined) delete process.env.TERM; else process.env.TERM = previous;
  }
  assert.equal(received.env.TERM, "xterm-256color");
});

test("native session lists exclude compatible legacy managed-command records", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-session-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") }); await store.initialize();
  await store.saveTerminal({ id: "legacy-terminal", projectId: "project-1", command: "npm", args: ["test"], status: "completed" });
  const manager = new TerminalSessionManager({ store });
  assert.deepEqual(await manager.list({ projectId: "project-1" }), []);
  assert.equal((await store.listTerminals({ projectId: "project-1" })).length, 1);
});

test("PTY sessions keep ANSI output in memory and accept input, resize, focus, and snapshots", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-pty-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") }); await store.initialize();
  const child = new EventEmitter(); child.pid = 42; child.write = (data) => { child.written = data; }; child.resize = (columns, rows) => { child.size = [columns, rows]; }; child.kill = () => {};
  child.onData = (listener) => { child.data = listener; }; child.onExit = (listener) => { child.exit = listener; };
  const manager = new TerminalSessionManager({ store, ptySessions: new (require("../pty-session-manager").PtySessionManager)({ store, ptyModule: { spawn: () => child } }) });
  const session = await manager.create({ projectId: "project-1", workspacePath: root, kind: "shell", command: "sh", backend: "pty" });
  child.data("\u001b[32mok\u001b[0m\r\n");
  assert.equal(await manager.input(session.id, "echo hi\n"), true);
  assert.equal(child.written, "echo hi\n");
  assert.equal(await manager.resize(session.id, 120, 40), true);
  assert.deepEqual(child.size, [120, 40]);
  assert.equal(await manager.focus(session.id), true);
  const snapshot = await manager.snapshot(session.id);
  assert.match(snapshot.ansi, /ok/u);
  assert.match(snapshot.deltaAnsi, /ok/u);
  assert.ok(snapshot.sequence > 0);
  assert.equal((await manager.snapshot(session.id, snapshot.sequence)).deltaAnsi, "");
  child.data("next\r\n");
  const incremental = await manager.snapshot(session.id, snapshot.sequence);
  assert.match(incremental.deltaAnsi, /next/u);
  assert.doesNotMatch(incremental.deltaAnsi, /ok/u);
  assert.equal(snapshot.focused, true);
  assert.equal(Object.hasOwn(await store.getTerminal(session.id), "output"), false);
});
