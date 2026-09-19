"use strict";

/**
 * F8 reuse verdict: keep the existing terminal managers. They already provide
 * bounded snapshots, metadata-only PTY persistence, and distinct observe/input
 * operations. Run-to-terminal correlation belongs in RunTerminalBridge.
 */

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../runtime/store");
const { createBuffer, PtySessionManager } = require("../runtime/terminals/pty-session-manager");
const { TerminalSessionManager } = require("../runtime/terminals/session-manager");
const { TerminalManager } = require("../runtime/terminals/terminal-manager");

function temporaryStore(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }) };
}

function fakePtyChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.write = (data) => { child.lastInput = data; };
  child.resize = (columns, rows) => { child.lastSize = [columns, rows]; };
  child.kill = () => {};
  child.onData = (listener) => { child.emitData = listener; };
  child.onExit = (listener) => { child.emitExit = listener; };
  return child;
}

test("F8.1 buffer snapshots are incremental and scrollback remains bounded", () => {
  const buffer = createBuffer(80, 24);
  buffer.write("first\n");
  const first = buffer.snapshot();
  buffer.write("second\n");
  const incremental = buffer.snapshot(first.sequence);

  assert.equal(incremental.deltaAnsi, "second\n");
  assert.equal(incremental.ansi, "first\nsecond\n");
  for (let index = 0; index < 2_100; index += 1) buffer.write(`line-${index}\n`);
  assert.ok(buffer.snapshot().lines.length <= 2_000);
  buffer.dispose();
});

test("F8.1 PTY observation stays separate from input and persists metadata only", async () => {
  const { root, store } = temporaryStore("maestro-f8-pty-");
  await store.initialize();
  const child = fakePtyChild();
  const ptySessions = new PtySessionManager({ store, ptyModule: { spawn: () => child } });
  const sessions = new TerminalSessionManager({ store, ptySessions });
  const session = await sessions.create({
    projectId: "project-f8", workspacePath: root, kind: "shell",
    command: process.execPath, args: [], backend: "pty"
  });

  child.emitData("secret prompt\r\n");
  const observed = await sessions.snapshot(session.id, 0);
  assert.deepEqual(Object.keys(observed).sort(), [
    "ansi", "columns", "connected", "cursor", "deltaAnsi", "focused",
    "lines", "rows", "scrollback", "sequence", "session"
  ]);
  assert.match(observed.deltaAnsi, /secret prompt/u);
  assert.equal(await sessions.focus(session.id), true);
  assert.equal(child.lastInput, undefined);
  assert.equal(await sessions.input(session.id, "approved input\n"), true);
  assert.equal(child.lastInput, "approved input\n");

  const persisted = await store.getTerminal(session.id);
  assert.equal(Object.hasOwn(persisted, "output"), false);
  assert.equal(Object.hasOwn(persisted, "prompt"), false);
  assert.doesNotMatch(JSON.stringify(persisted), /secret prompt/u);
});

test("F8.1 managed terminals emit chunks, buffer output in memory, persist metadata only", async () => {
  const { root, store } = temporaryStore("maestro-f8-terminal-");
  await store.initialize();
  const events = [];
  const terminals = new TerminalManager({ store, emitEvent: async (_runId, type, data) => events.push({ type, data }) });
  const terminal = await terminals.start({
    projectId: "project-f8", cwd: root, command: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(100500))"]
  });
  const completed = await terminals.wait(terminal.id);

  // Bounded in-memory buffer (same 100k cap), served to live waiters.
  assert.equal(completed.output.length, 100_000);
  assert.ok(events.some((event) => event.type === "terminal.output" && event.data.terminalId === terminal.id && event.data.chunk.length > 0));
  // Durable record never carries raw output/stderr/raw argv.
  const persisted = await store.getTerminal(terminal.id);
  assert.equal(Object.hasOwn(persisted, "output"), false);
  assert.equal(Object.hasOwn(persisted, "stderr"), false);
  assert.equal(Object.hasOwn(persisted, "args"), false);
  assert.equal(persisted.argCount, 2);
});
