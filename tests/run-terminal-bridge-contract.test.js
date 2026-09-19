"use strict";

/**
 * PR18 ETAPA 9/10: terminal bridge publisher contract + ephemeral replay.
 *
 * - Constructor rejects an app with no supported publisher (neither
 *   publishEphemeral nor events.emit).
 * - publishEphemeral-only and events.emit-only apps are accepted.
 * - Disconnect/reconnect on the same instance replays from memory; the
 *   durable store never contains raw output chunks.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { MaestroApplication } = require("../runtime/application/maestro-application");
const { RunTerminalBridge } = require("../runtime/runs/run-terminal-bridge");
const { JsonFileRunStore } = require("../runtime/store");

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-contract-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") });
  const app = new MaestroApplication({ projectRoot: root, store });
  await app.initialize();
  await store.createProject({ id: "project-b", path: root, name: "B" });
  await store.saveTask({ id: "task-b", projectId: "project-b", description: "Bridge" });
  await store.saveRun({ id: "run-b", taskId: "task-b", providerId: "fake", status: "running", metadata: {} });
  return { app, store, root };
}

function fakeTerminals() {
  return {
    active: new Map(),
    async start() { return { id: "terminal-fake", backend: "managed" }; },
    async stop() {},
    async sendInput() { return true; }
  };
}

function fakeSessions() {
  return { ptySessions: { available: () => false } };
}

function minimalApp(overrides = {}) {
  return {
    subscribe: () => () => {},
    record: async () => ({}),
    ...overrides
  };
}

test("constructor rejects an app with no supported publisher", () => {
  assert.throws(
    () => new (require("../runtime/runs/run-terminal-bridge").RunTerminalBridge)({
      app: minimalApp(), store: {}, terminals: fakeTerminals(), terminalSessions: fakeSessions()
    }),
    /publishEphemeral or events\.emit/
  );
});

test("constructor accepts publishEphemeral-only and events.emit-only apps", () => {
  const withPublish = minimalApp({ publishEphemeral: () => ({}) });
  const withEmit = minimalApp({ events: new EventEmitter() });
  assert.ok(new RunTerminalBridge({ app: withPublish, store: {}, terminals: fakeTerminals(), terminalSessions: fakeSessions() }));
  assert.ok(new RunTerminalBridge({ app: withEmit, store: {}, terminals: fakeTerminals(), terminalSessions: fakeSessions() }));
});

test("reconnect replays from memory and raw output stays out of the store", async () => {
  const { app, store } = await fixture();
  const bridge = new RunTerminalBridge({ app, store, terminals: fakeTerminals(), terminalSessions: fakeSessions() });
  const seen = [];
  const off = bridge.subscribe("run-b", (event) => seen.push(event));
  // Drive the ephemeral fan-out directly (same path as live output).
  await bridge._publish("run-b", "SECRET_CHUNK_ALPHA");
  await bridge._publish("run-b", "second chunk");
  assert.equal(seen.length, 2);
  off();
  // Reconnect: memory replay serves both chunks again. Seed the binding the
  // way attach() would (no terminal start needed for a memory-only replay).
  bridge.bindings.set("run-b", { runId: "run-b", terminalId: "terminal-fake", backend: "managed" });
  const snap = await bridge.snapshot("run-b", 0);
  assert.match(snap.ansi, /SECRET_CHUNK_ALPHA/);
  assert.match(snap.ansi, /second chunk/);
  const afterFirst = await bridge.snapshot("run-b", seen[0].sequence);
  assert.doesNotMatch(afterFirst.deltaAnsi, /SECRET_CHUNK_ALPHA/);
  assert.match(afterFirst.deltaAnsi, /second chunk/);
  // Durable store has no raw output: no run.output/provider.output chunks,
  // no snapshot rows.
  const events = await store.listEvents({ runId: "run-b" });
  const rawish = events.filter((e) =>
    e.type === "run.output" || e.type === "provider.output" || e.type === "run.output.snapshot");
  assert.equal(rawish.length, 0, "raw output must stay ephemeral");
});

test("terminal stream events never reach the durable store", async () => {
  const { app, store } = await fixture();
  const received = [];
  const off = app.subscribe((event) => received.push(event));
  await app.record(null, "terminal.output", { terminalId: "t-1", chunk: "TERMINAL_SECRET_XYZ" });
  await app.record(null, "agentSession.output", { terminalId: "t-1", bytes: 18 });
  off();
  // Live subscribers still see the stream (ephemeral fan-out preserved).
  assert.ok(received.some((e) => e.type === "terminal.output"));
  const content = JSON.stringify(await store.listEvents({}));
  assert.equal(content.includes("TERMINAL_SECRET_XYZ"), false, "terminal chunks must stay ephemeral");
});
