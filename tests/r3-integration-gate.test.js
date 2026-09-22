"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const planner = require("../runtime/planner");
const { LaneExecutor } = require("../runtime/planner/lane-executor");

test("R3 integration gate exporta persistência e enriquece toda execução com missão/task", async () => {
  assert.equal(typeof planner.TaskGraphPersistence, "function");
  assert.equal(typeof planner.PlanPersistenceHooks, "function");
  assert.equal(typeof planner.TaskLifecycleMonitor, "function");
  const requests = [];
  const app = {
    getMission: async () => ({ projectId: "p1" }),
    executeRun: async (request) => { requests.push(request); return { ok: true }; }
  };
  const executor = new LaneExecutor({ application: app, maxParallel: 2 });
  await executor.execute([
    { id: "semantic-a", description: "A", provider: "fake", dependsOn: [] },
    { id: "semantic-b", description: "B", provider: "fake", dependsOn: ["semantic-a"] }
  ], "mission-1");
  assert.deepEqual(requests.map(({ missionId, semanticTaskId, projectId }) => ({ missionId, semanticTaskId, projectId })), [
    { missionId: "mission-1", semanticTaskId: "semantic-a", projectId: "p1" },
    { missionId: "mission-1", semanticTaskId: "semantic-b", projectId: "p1" }
  ]);
  assert.ok(executor instanceof EventEmitter);
});
