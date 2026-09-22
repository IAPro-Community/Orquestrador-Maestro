"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { LaneExecutor } = require("../lane-executor");

function task(id, dependsOn = []) {
  return {
    id,
    description: id,
    provider: "codex",
    model: "default",
    skills: [],
    dependsOn,
    semanticMetadata: { id, scopeClassification: "IN_SCOPE" }
  };
}

test("LaneExecutor does not mark a task completed when executeRun resolves with a failed run", async () => {
  const events = [];
  const app = {
    async getMission() { return { projectId: "project-1" }; },
    async executeRun() {
      return { run: { status: "failed", metadata: {} }, review: { status: "disabled" }, governanceBlocking: [] };
    }
  };
  const executor = new LaneExecutor({ application: app, maxParallel: 1 });
  executor.on("task.completed", (value) => events.push(["completed", value.id]));
  executor.on("task.failed", (value) => events.push(["failed", value.id, value.error]));

  const result = await executor.execute([task("task-1")], "mission-1");

  assert.equal(result["task-1"].status, "failed");
  assert.match(result["task-1"].error, /run finished with status: failed/u);
  assert.deepEqual(events.map((entry) => entry[0]), ["failed"]);
});

test("LaneExecutor blocks dependents when a resolved run is blocked or failed", async () => {
  const calls = [];
  const app = {
    async getMission() { return { projectId: "project-1" }; },
    async executeRun(request) {
      calls.push(request.semanticTaskId);
      return {
        run: {
          status: request.semanticTaskId === "task-1" ? "blocked" : "completed",
          metadata: request.semanticTaskId === "task-1" ? { preflightBlock: "human-approval-required" } : {}
        },
        governanceBlocking: []
      };
    }
  };
  const executor = new LaneExecutor({ application: app, maxParallel: 2 });
  const result = await executor.execute([task("task-1"), task("task-2", ["task-1"])], "mission-1");

  assert.deepEqual(calls, ["task-1"]);
  assert.equal(result["task-1"].status, "failed");
  assert.equal(result["task-1"].error, "human-approval-required");
  assert.equal(result["task-2"].status, "failed");
  assert.match(result["task-2"].error, /blocked by failed dependency: task-1/u);
});

test("LaneExecutor marks a task completed only for a completed run", async () => {
  const app = {
    async getMission() { return { projectId: "project-1" }; },
    async executeRun() { return { run: { status: "completed", metadata: {} } }; }
  };
  const executor = new LaneExecutor({ application: app, maxParallel: 1 });
  const result = await executor.execute([task("task-1")], "mission-1");
  assert.equal(result["task-1"].status, "completed");
});


test("LaneExecutor rejects completed runs whose canonical outcome is not validated", async () => {
  const app = {
    async getMission() { return { projectId: "project-1" }; },
    async executeRun() {
      return {
        run: {
          status: "completed",
          metadata: { resolution: { outcome: { state: "needs_attention" } } }
        }
      };
    }
  };
  const executor = new LaneExecutor({ application: app, maxParallel: 1 });
  const result = await executor.execute([task("task-1")], "mission-1");
  assert.equal(result["task-1"].status, "failed");
  assert.equal(result["task-1"].error, "resolution outcome: needs_attention");
});


test("LaneExecutor preserves policy failures instead of relabeling them as provider failures", async () => {
  const app = {
    async getMission() { return { projectId: "project-1" }; },
    async executeRun() {
      const error = new Error("MISSION_SCOPE_MISMATCH: wrong project");
      error.code = "MISSION_SCOPE_MISMATCH";
      throw error;
    }
  };
  const executor = new LaneExecutor({ application: app, maxParallel: 1 });
  const result = await executor.execute([task("task-1")], "mission-1");
  assert.equal(result["task-1"].status, "failed");
  assert.equal(result["task-1"].failureClass, "policy-block");
});
