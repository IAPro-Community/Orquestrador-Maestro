"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { TaskLifecycleMonitor } = require("../task-lifecycle-monitor");
const { runtimeTaskId } = require("../../core/task-identity");

test("TaskLifecycleMonitor emits the persisted mission-scoped task identity", async () => {
  const executor = new EventEmitter();
  const recorded = [];
  const appEvents = new EventEmitter();
  const app = {
    async record(_runId, type, data) { recorded.push({ type, data }); },
    subscribe(listener) { appEvents.on("event", listener); return () => appEvents.off("event", listener); }
  };
  const graphs = {
    async missionForTask() {
      return { missionId: "stale-brief-id", projectId: "stale-project", graphId: "stale-graph" };
    }
  };
  const store = {
    async getRun() { return null; },
    async getTask() { return null; }
  };
  const missionId = "mission-runtime";
  const projectId = "project-runtime";
  const graphId = "graph-approved";
  const monitor = TaskLifecycleMonitor.attach({ executor, app, graphs, store, missionId, projectId, graphId });

  executor.emit("task.started", { id: "task-1" });
  executor.emit("task.completed", { id: "task-1" });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  monitor.detach();

  const expectedTaskId = runtimeTaskId({ missionId, semanticTaskId: "task-1" });
  assert.ok(recorded.length >= 3);
  for (const event of recorded) {
    assert.equal(event.data.taskId, expectedTaskId);
    assert.equal(event.data.missionId, missionId);
    assert.equal(event.data.projectId, projectId);
    assert.equal(event.data.graphId, graphId);
  }
});

test("TaskLifecycleMonitor canonicalizes blocked dependency ids", async () => {
  const executor = new EventEmitter();
  const recorded = [];
  const app = {
    async record(_runId, type, data) { recorded.push({ type, data }); },
    subscribe() { return () => {}; }
  };
  const graphs = { async missionForTask() { return null; } };
  const missionId = "mission-runtime";
  const monitor = TaskLifecycleMonitor.attach({
    executor,
    app,
    graphs,
    store: {},
    missionId,
    projectId: "project-runtime",
    graphId: "graph-approved"
  });

  executor.emit("task.failed", {
    id: "task-2",
    error: "blocked by failed dependency: task-1"
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  monitor.detach();

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].type, "task.blocked");
  assert.equal(recorded[0].data.taskId, runtimeTaskId({ missionId, semanticTaskId: "task-2" }));
  assert.deepEqual(recorded[0].data.blockedBy, [runtimeTaskId({ missionId, semanticTaskId: "task-1" })]);
});
