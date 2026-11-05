"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assessGoalCorrection } = require("../goal-loop-policy");

const digest = (character) => character.repeat(64);
const tasks = [
  { id: "frontend", dependsOn: [], acceptanceCriteria: ["Frontend verified"] },
  { id: "backend", dependsOn: [], acceptanceCriteria: ["Backend verified"] },
  { id: "integration", dependsOn: ["frontend", "backend"], acceptanceCriteria: ["Integration verified"] }
];
const completed = (task) => ({
  status: "completed",
  verification: { status: "passed" },
  evidence: [{ taskId: task.id, acceptanceCriterion: task.acceptanceCriteria[0], content: "verified test receipt" }]
});
const verified = () => new Map(tasks.map((task) => [task.id, completed(task)]));
const params = (overrides = {}) => ({
  tasks,
  results: verified(),
  planDigest: digest("a"),
  limits: { maxIterations: 3, maxRepeatSameFailure: 2, maxTotalCostUSD: 10, maxDurationMs: 100000 },
  usage: { iterations: 0, totalCostUSD: 0, elapsedMs: 0 },
  failureFingerprints: { frontend: digest("f"), backend: digest("e") },
  history: [],
  ...overrides
});

test("only failed frontend and its downstream integration are invalidated", () => {
  const results = verified();
  results.set("frontend", { status: "failed", error: "frontend contract failure" });
  results.set("integration", { status: "failed", error: "blocked by failed dependency: frontend" });
  const before = JSON.stringify(tasks);
  const decision = assessGoalCorrection(params({ results }));
  assert.equal(decision.decision, "CORRECTIVE_REVIEW");
  assert.equal(decision.executionEnabled, false);
  assert.equal(decision.requiresApproval, true);
  assert.deepEqual(decision.failedTaskIds, ["frontend"]);
  assert.deepEqual(decision.affectedTaskIds, ["frontend", "integration"]);
  assert.deepEqual(decision.preservedTaskIds, ["backend"]);
  assert.equal(JSON.stringify(tasks), before);
});

test("PASS requires real per-criterion evidence with passed verification", () => {
  const decision = assessGoalCorrection(params());
  assert.equal(decision.decision, "PASS");
  assert.equal(decision.requiresApproval, false);
  assert.deepEqual(decision.preservedTaskIds, ["frontend", "backend", "integration"]);
  const noEvidence = verified();
  noEvidence.set("frontend", { status: "completed" });
  const denied = assessGoalCorrection(params({ results: noEvidence }));
  assert.equal(denied.decision, "BLOCKED_NEEDS_USER");
  assert.equal(denied.reason, "EVIDENCE_OR_POLICY_REVIEW_REQUIRED");
});

test("repeat fingerprints, missing lineage and exceeded budgets fail closed", () => {
  const results = verified();
  results.set("frontend", { status: "failed", error: "failed" });
  results.set("integration", { status: "failed", error: "blocked by failed dependency: frontend" });
  const base = params({ results });
  const repeated = assessGoalCorrection({
    ...base,
    history: [
      { taskId: "frontend", failureFingerprint: digest("f") },
      { taskId: "frontend", failureFingerprint: digest("f") }
    ]
  });
  assert.equal(repeated.reason, "REPEATED_FAILURE_LIMIT");
  const missing = assessGoalCorrection({ ...base, failureFingerprints: {} });
  assert.equal(missing.reason, "FAILURE_PROVENANCE_REQUIRED");
  for (const [usage, reason] of [
    [{ ...base.usage, iterations: 3 }, "ITERATION_BUDGET_EXHAUSTED"],
    [{ ...base.usage, totalCostUSD: 10 }, "COST_BUDGET_EXHAUSTED"],
    [{ ...base.usage, elapsedMs: 100000 }, "DURATION_BUDGET_EXHAUSTED"]
  ]) {
    assert.equal(assessGoalCorrection({ ...base, usage }).reason, reason);
  }
});

test("rejects cycles, dangling DAG edges and unverifiable immutable approvals", () => {
  assert.throws(() => assessGoalCorrection(params({
    tasks: [
      { id: "first", dependsOn: ["second"] },
      { id: "second", dependsOn: ["first"] }
    ]
  })), /cycle/);
  assert.throws(() => assessGoalCorrection(params({
    tasks: [{ id: "first", dependsOn: ["missing"] }]
  })), /dependencies/);
  assert.throws(() => assessGoalCorrection(params({ planDigest: "not-a-digest" })), /planDigest/);
  assert.throws(() => assessGoalCorrection(params({ usage: { iterations: 0 } })), /budget/);
});
