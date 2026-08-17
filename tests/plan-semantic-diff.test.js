"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { computeSemanticDiff, hasChanges, describeDiff } = require("../runtime/planner/plan-semantic-diff.js");

function makeTask(id, overrides = {}) {
  return Object.freeze({
    id,
    title: `Task ${id}`,
    objective: `Objective ${id}`,
    dependsOn: [],
    risk: "low",
    complexity: "simple",
    requiredCapabilities: ["javascript"],
    ...overrides
  });
}

test("plan-semantic-diff: no changes returns empty diff", () => {
  const tasks = [makeTask("T1"), makeTask("T2")];
  const diff = computeSemanticDiff(tasks, tasks);
  assert.equal(diff.addedTasks.length, 0);
  assert.equal(diff.removedTasks.length, 0);
  assert.equal(diff.changedTasks.length, 0);
  assert.equal(diff.dependencyChanges.length, 0);
  assert.equal(diff.riskChanges.length, 0);
  assert.equal(diff.complexityChanges.length, 0);
  assert.equal(diff.capabilityChanges.length, 0);
  assert.equal(hasChanges(diff), false);
});

test("plan-semantic-diff: detects added tasks", () => {
  const orig = [makeTask("T1")];
  const revised = [makeTask("T1"), makeTask("T3")];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.addedTasks.length, 1);
  assert.equal(diff.addedTasks[0].id, "T3");
  assert.equal(hasChanges(diff), true);
});

test("plan-semantic-diff: detects removed tasks", () => {
  const orig = [makeTask("T1"), makeTask("T2")];
  const revised = [makeTask("T1")];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.removedTasks.length, 1);
  assert.equal(diff.removedTasks[0].id, "T2");
  assert.equal(hasChanges(diff), true);
});

test("plan-semantic-diff: detects title change", () => {
  const orig = [makeTask("T1", { title: "Original" })];
  const revised = [makeTask("T1", { title: "Revised" })];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.changedTasks.length, 1);
  assert.equal(diff.changedTasks[0].changes[0].field, "title");
  assert.equal(hasChanges(diff), true);
});

test("plan-semantic-diff: detects dependency change", () => {
  const orig = [makeTask("T1", { dependsOn: ["T0"] })];
  const revised = [makeTask("T1", { dependsOn: ["T0", "T2"] })];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.dependencyChanges.length, 1);
  assert.deepEqual(diff.dependencyChanges[0].from, ["T0"]);
  assert.deepEqual(diff.dependencyChanges[0].to, ["T0", "T2"]);
});

test("plan-semantic-diff: detects risk change", () => {
  const orig = [makeTask("T1", { risk: "low" })];
  const revised = [makeTask("T1", { risk: "high" })];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.riskChanges.length, 1);
  assert.equal(diff.riskChanges[0].from, "low");
  assert.equal(diff.riskChanges[0].to, "high");
});

test("plan-semantic-diff: detects complexity change", () => {
  const orig = [makeTask("T1", { complexity: "simple" })];
  const revised = [makeTask("T1", { complexity: "complex" })];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.complexityChanges.length, 1);
  assert.equal(diff.complexityChanges[0].from, "simple");
  assert.equal(diff.complexityChanges[0].to, "complex");
});

test("plan-semantic-diff: detects capability change", () => {
  const orig = [makeTask("T1", { requiredCapabilities: ["javascript"] })];
  const revised = [makeTask("T1", { requiredCapabilities: ["python"] })];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.capabilityChanges.length, 1);
});

test("plan-semantic-diff: handles empty inputs", () => {
  const diff = computeSemanticDiff(null, null);
  assert.equal(diff.addedTasks.length, 0);
  assert.equal(diff.removedTasks.length, 0);
  assert.equal(hasChanges(diff), false);
});

test("plan-semantic-diff: detects multiple changes in one task", () => {
  const orig = [makeTask("T1", { title: "Old", risk: "low", complexity: "simple" })];
  const revised = [makeTask("T1", { title: "New", risk: "high", complexity: "complex" })];
  const diff = computeSemanticDiff(orig, revised);
  assert.equal(diff.changedTasks.length, 1);
  assert.equal(diff.changedTasks[0].changes.length, 1); // title
  assert.equal(diff.riskChanges.length, 1);
  assert.equal(diff.complexityChanges.length, 1);
});

test("describeDiff: returns summary string", () => {
  const orig = [makeTask("T1")];
  const revised = [makeTask("T1"), makeTask("T2")];
  const diff = computeSemanticDiff(orig, revised);
  const desc = describeDiff(diff);
  assert.ok(desc.includes("Added: T2"));
});

test("describeDiff: no changes", () => {
  const diff = computeSemanticDiff([], []);
  assert.equal(describeDiff(diff), "No changes");
});
