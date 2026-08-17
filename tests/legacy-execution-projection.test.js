"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { LegacyExecutionProjection } = require("../runtime/planner/legacy-execution-projection");
const { createSemanticTask } = require("../runtime/planner/task-graph-proposal");

test("projectTask throws if semanticTask is not an object", () => {
  assert.throws(
    () => LegacyExecutionProjection.projectTask(null, { executionTarget: { providerId: "codex", model: "gpt-4" } }),
    /semanticTask must be an object/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectTask("invalid", { executionTarget: { providerId: "codex", model: "gpt-4" } }),
    /semanticTask must be an object/
  );
});

test("projectTask throws if executionTarget is missing (no silent codex default)", () => {
  const task = createSemanticTask({ id: "t1", title: "Task 1", objective: "Obj 1" });
  assert.throws(
    () => LegacyExecutionProjection.projectTask(task),
    /MISSING_EXECUTION_TARGET/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectTask(task, {}),
    /MISSING_EXECUTION_TARGET/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectTask(task, { executionTarget: {} }),
    /MISSING_EXECUTION_TARGET/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectTask(task, { executionTarget: { providerId: "codex" } }),
    /MISSING_EXECUTION_TARGET/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectTask(task, { executionTarget: { model: "gpt-4" } }),
    /MISSING_EXECUTION_TARGET/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectTask(task, { executionTarget: { providerId: "   ", model: "gpt-4" } }),
    /MISSING_EXECUTION_TARGET/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectTask(task, { executionTarget: { providerId: "codex", model: "   " } }),
    /MISSING_EXECUTION_TARGET/
  );
});

test("projectTask maps semantic fields and transports provided execution target", () => {
  const task = createSemanticTask({
    id: "t1",
    title: "Implement Domain",
    objective: "Define product entities",
    acceptanceCriteria: ["Product entity with price", "Validation on empty name"],
    requiredSkills: ["architecture", "domain-design"],
    dependsOn: ["t0"]
  });

  const projected = LegacyExecutionProjection.projectTask(task, {
    executionTarget: { providerId: "opencode", model: "local-model" }
  });

  assert.equal(projected.id, "t1");
  assert.equal(projected.label, "Implement Domain");
  assert.ok(projected.description.startsWith("Define product entities"));
  assert.ok(projected.description.includes("Acceptance Criteria:"));
  assert.ok(projected.description.includes("- Product entity with price"));
  assert.ok(projected.description.includes("- Validation on empty name"));
  assert.deepEqual(projected.skills, ["architecture", "domain-design"]);
  assert.deepEqual(projected.dependsOn, ["t0"]);
  assert.equal(projected.provider, "opencode");
  assert.equal(projected.model, "local-model");
  assert.deepEqual(projected.semanticMetadata, task);
  assert.ok(Object.isFrozen(projected));
});

test("projectTask formats description cleanly when acceptanceCriteria is empty", () => {
  const task = createSemanticTask({
    id: "t1",
    title: "Simple Task",
    objective: "Just do the simple thing",
    acceptanceCriteria: []
  });

  const projected = LegacyExecutionProjection.projectTask(task, {
    providerId: "claude",
    model: "claude-3-7-sonnet"
  });

  assert.equal(projected.description, "Just do the simple thing");
  assert.equal(projected.provider, "claude");
  assert.equal(projected.model, "claude-3-7-sonnet");
});

test("projectGraph maps an array of semantic tasks to legacy projected tasks", () => {
  const task1 = createSemanticTask({ id: "t1", title: "Task 1", objective: "Obj 1" });
  const task2 = createSemanticTask({ id: "t2", title: "Task 2", objective: "Obj 2", dependsOn: ["t1"] });

  const projectedList = LegacyExecutionProjection.projectGraph([task1, task2], {
    executionTarget: { providerId: "codex", model: "o3-mini" }
  });

  assert.equal(Array.isArray(projectedList), true);
  assert.equal(projectedList.length, 2);
  assert.equal(projectedList[0].id, "t1");
  assert.equal(projectedList[0].provider, "codex");
  assert.equal(projectedList[0].model, "o3-mini");
  assert.equal(projectedList[1].id, "t2");
  assert.deepEqual(projectedList[1].dependsOn, ["t1"]);
  assert.ok(Object.isFrozen(projectedList));
});

test("projectGraph throws if semanticTasks is not an array", () => {
  assert.throws(
    () => LegacyExecutionProjection.projectGraph(null, { executionTarget: { providerId: "codex", model: "o3-mini" } }),
    /semanticTasks must be an array/
  );
  assert.throws(
    () => LegacyExecutionProjection.projectGraph({}, { executionTarget: { providerId: "codex", model: "o3-mini" } }),
    /semanticTasks must be an array/
  );
});

test("projection does not choose provider or model and target provided is transported unchanged", () => {
  const customTarget = { providerId: "custom-special-provider", model: "custom-deep-model-v9" };
  const task = createSemanticTask({ id: "t99", title: "Custom Task", objective: "Custom Obj" });

  const projected = LegacyExecutionProjection.projectTask(task, { executionTarget: customTarget });
  assert.equal(projected.provider, "custom-special-provider");
  assert.equal(projected.model, "custom-deep-model-v9");
});
