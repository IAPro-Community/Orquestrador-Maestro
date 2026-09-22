"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  deriveMissionResolution,
  deriveMissionResolutionFromTaskStates
} = require("..");

test("mission validates only when every planned task is validated", () => {
  const resolution = deriveMissionResolution({
    "task-1": { status: "completed", resolutionState: "validated" },
    "task-2": { status: "completed", resolutionState: "validated" }
  }, { objective: "Deliver feature", now: "2026-09-21T00:00:00.000Z" });

  assert.equal(resolution.state, "validated");
  assert.equal(resolution.status, "completed");
  assert.equal(resolution.summary.tasks, 2);
  assert.equal(resolution.summary.validatedTasks, 2);
  assert.equal(resolution.definitionOfDone.rule, "all-planned-tasks-validated");
});

test("mission becomes blocked when a task needs attention or is dependency-blocked", () => {
  const attention = deriveMissionResolution({
    "task-1": { status: "completed", resolutionState: "validated" },
    "task-2": { status: "failed", resolutionState: "needs_attention", error: "resolution outcome: needs_attention" }
  });
  assert.equal(attention.state, "needs_attention");
  assert.equal(attention.status, "blocked");
  assert.equal(attention.summary.needsAttentionTasks, 1);

  const blocked = deriveMissionResolution({
    "task-1": { status: "failed", resolutionState: "failed" },
    "task-2": { status: "failed", error: "blocked by failed dependency: task-1" }
  });
  assert.equal(blocked.state, "failed");
  assert.equal(blocked.status, "failed");
  assert.equal(blocked.summary.blockedTasks, 1);
});

test("mission proof derivation never treats an empty task set as validated", () => {
  const resolution = deriveMissionResolutionFromTaskStates([], { objective: "Nothing planned" });
  assert.equal(resolution.state, "needs_attention");
  assert.equal(resolution.status, "blocked");
  assert.equal(resolution.reason, "no-task-outcomes");
});
