"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const { MaestroApplication } = require("../runtime/application/maestro-application");
const { RunTerminalBridge } = require("../runtime/runs/run-terminal-bridge");
const { JsonFileRunStore } = require("../runtime/store");
const { TerminalManager } = require("../runtime/terminals/terminal-manager");
const { PtySessionManager } = require("../runtime/terminals/pty-session-manager");
const { TerminalSessionManager } = require("../runtime/terminals/session-manager");

async function waitFor(predicate, message, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-f8-bridge-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") });
  const app = new MaestroApplication({ projectRoot: root, store });
  await app.initialize();
  await store.createProject({ id: "project-f8", path: root, name: "F8" });
  await store.saveMission({ id: "mission-f8", projectId: "project-f8", objective: "Test F8" });
  await store.saveTask({ id: "task-f8", projectId: "project-f8", description: "Bridge", metadata: { missionId: "mission-f8" } });
  await store.saveRun({ id: "run-f8", taskId: "task-f8", providerId: "fake", status: "running", metadata: {} });
  const terminals = new TerminalManager({ store, emitEvent: (runId, type, data) => app.record(runId, type, data) });
  const terminalSessions = { ptySessions: { available: () => false } };
  const bridge = new RunTerminalBridge({ app, store, terminals, terminalSessions });
  return { app, bridge, root, store };
}

test("F8.2 attaches a run to fallback terminal output with ordered snapshots", async () => {
  const { bridge, root, store } = await fixture();
  const observed = [];
  const unsubscribe = bridge.subscribe("run-f8", (event) => observed.push(event));
  const attached = await bridge.attach({
    runId: "run-f8", projectId: "project-f8", workspacePath: root,
    command: process.execPath,
    args: ["-e", "setTimeout(()=>console.log('first'),30);setTimeout(()=>console.log('second'),80)"]
  });

  assert.match(attached.terminalId, /^terminal-/u);
  assert.equal(attached.backend, "managed");
  await waitFor(() => observed.length >= 2, "expected two terminal chunks");
  assert.deepEqual(observed.map((event) => event.sequence), [1, 2]);
  assert.equal(observed.every((event) => event.runId === "run-f8"), true);

  const afterFirst = await bridge.snapshot("run-f8", observed[0].sequence);
  assert.doesNotMatch(afterFirst.deltaAnsi, /first/u);
  assert.match(afterFirst.deltaAnsi, /second/u);
  const persistedRun = await store.getRun("run-f8");
  assert.equal(persistedRun.metadata.terminalId, attached.terminalId);
  assert.equal(persistedRun.metadata.interactive, false);
  // Ephemeral stream: terminal chunks fan out live + in-memory replay, never
  // as per-chunk durable writes (privacy + write amplification).
  assert.equal((await store.listEvents({ runId: "run-f8" })).filter((event) => event.type === "run.output").length, 0);
  assert.ok((await store.listEvents({})).some((event) => event.type === "run.attachPty" && event.data.runId === "run-f8"));
  assert.deepEqual(await bridge.input("run-f8", "blocked\n"), { granted: false });
  unsubscribe();
});

test("F8.2 observation can detach and re-subscribe without stopping the process", async () => {
  const { bridge, root } = await fixture();
  const firstView = [];
  const unsubscribe = bridge.subscribe("run-f8", (event) => firstView.push(event));
  await bridge.attach({
    runId: "run-f8", projectId: "project-f8", workspacePath: root,
    command: process.execPath,
    args: ["-e", "setTimeout(()=>console.log('visible'),20);setTimeout(()=>console.log('while-detached'),120)"]
  });
  await waitFor(() => firstView.length === 1, "expected first visible chunk");
  const checkpoint = firstView[0].sequence;
  unsubscribe();

  await waitFor(async () => (await bridge.snapshot("run-f8", checkpoint)).deltaAnsi.includes("while-detached"), "process output stopped after detach");
  const secondView = [];
  const detachSecond = bridge.subscribe("run-f8", (event) => secondView.push(event));
  const replay = await bridge.snapshot("run-f8", checkpoint);
  assert.match(replay.deltaAnsi, /while-detached/u);
  assert.equal(secondView.length, 0);
  detachSecond();
});

test("F8.2 input requires an explicit per-run interactive grant", async () => {
  const { bridge, root } = await fixture();
  await bridge.attach({
    runId: "run-f8", projectId: "project-f8", workspacePath: root, interactive: true,
    command: process.execPath,
    args: ["-e", "process.stdin.once('data',d=>{process.stdout.write('input:'+d);process.exit(0)})"]
  });
  assert.deepEqual(await bridge.input("run-f8", "allowed\n"), { granted: true });
  await waitFor(async () => (await bridge.snapshot("run-f8", 0)).ansi.includes("input:allowed"), "interactive input was not delivered");
});

test("F8.2 selects the injected PTY backend and delegates incremental snapshots", async () => {
  const { app, root, store } = await fixture();
  const child = new EventEmitter();
  child.pid = 8181;
  child.write = () => {};
  child.resize = () => {};
  child.kill = () => {};
  child.onData = (listener) => { child.emitData = listener; };
  child.onExit = (listener) => { child.emitExit = listener; };
  const ptySessions = new PtySessionManager({
    store, emitEvent: (runId, type, data) => app.record(runId, type, data),
    ptyModule: { spawn: () => child }
  });
  const terminalSessions = new TerminalSessionManager({
    store, ptySessions, emitEvent: (runId, type, data) => app.record(runId, type, data)
  });
  const bridge = new RunTerminalBridge({
    app, store, terminalSessions,
    terminals: new TerminalManager({ store, emitEvent: (runId, type, data) => app.record(runId, type, data) })
  });

  const attached = await bridge.attach({
    runId: "run-f8", projectId: "project-f8", workspacePath: root,
    command: process.execPath, args: [], interactive: true
  });
  assert.equal(attached.backend, "pty");
  child.emitData("pty:first\r\n");
  await waitFor(async () => (await bridge.snapshot("run-f8", 0)).sequence === 1, "PTY sequence did not advance");
  const checkpoint = (await bridge.snapshot("run-f8", 0)).sequence;
  child.emitData("pty:second\r\n");
  const incremental = await waitFor(async () => {
    const value = await bridge.snapshot("run-f8", checkpoint);
    return value.deltaAnsi.includes("pty:second") ? value : null;
  }, "PTY incremental snapshot was not delegated");
  assert.doesNotMatch(incremental.deltaAnsi, /pty:first/u);
});
