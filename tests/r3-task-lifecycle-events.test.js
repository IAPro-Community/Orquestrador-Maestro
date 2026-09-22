"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { TaskLifecycleMonitor } = require("../runtime/planner/task-lifecycle-monitor");

test("F4.2 mapeia ready/started/completed/failed/blocked/verifying com missionId", async () => {
  const executor = new EventEmitter(); const appEvents = new EventEmitter(); const recorded = [];
  const app = { record: async (_runId, type, data) => recorded.push({ type, data }), subscribe: (listener) => { appEvents.on("event", listener); return () => appEvents.off("event", listener); } };
  const graphs = { missionForTask: async (taskId) => ({ missionId: "m1", projectId: "p1", graphId: "g1", taskId }) };
  const store = { getRun: async () => ({ taskId: "a" }) };
  const attached = TaskLifecycleMonitor.attach({ executor, app, graphs, store });
  executor.emit("task.started", { id: "a" });
  executor.emit("task.completed", { id: "a" });
  executor.emit("task.failed", { id: "b", error: "blocked by failed dependency: a" });
  executor.emit("task.failed", { id: "c", error: "boom" });
  appEvents.emit("event", { type: "provider.completed", runId: "r1" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(recorded.map((event) => event.type), ["task.ready", "task.started", "task.completed", "task.blocked", "task.failed", "task.verifying"]);
  assert.ok(recorded.every((event) => event.data.missionId === "m1"));
  assert.deepEqual(recorded.find((event) => event.type === "task.blocked").data.blockedBy, ["a"]);
  attached.detach();
});


test("task lifecycle persistence redacts secrets and local paths from failures", async () => {
  const executor = new EventEmitter();
  const recorded = [];
  const app = { record: async (_runId, type, data) => recorded.push({ type, data }), subscribe: () => () => {} };
  const graphs = { missionForTask: async () => ({ missionId: "m1", projectId: "p1", graphId: "g1" }) };
  const store = { getRun: async () => null };
  const attached = TaskLifecycleMonitor.attach({ executor, app, graphs, store, missionId: "m1", projectId: "p1", graphId: "g1" });
  const token = "ghp_" + "C".repeat(40);

  executor.emit("task.failed", { id: "a", error: `Bearer ${token} failed at /home/alice/private/repo` });
  await new Promise((resolve) => setImmediate(resolve));

  const failure = recorded.find((event) => event.type === "task.failed");
  assert.ok(failure);
  const serialized = JSON.stringify(failure.data);
  assert.doesNotMatch(serialized, new RegExp(token, "u"));
  assert.doesNotMatch(serialized, /\/home\/alice\/private/u);
  assert.match(serialized, /redacted/u);
  attached.detach();
});
