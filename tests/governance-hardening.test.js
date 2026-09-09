"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CHANGE_CLASSES,
  HIGH_RISK_CHANGE_CLASSES,
  classifyChange,
  classifyDiscovery,
  isTaskCompletionEligible
} = require("../runtime/governance/change-governance");
const { createSemanticTask } = require("../runtime/planner/task-graph-proposal");
const { GraphValidator } = require("../runtime/planner/graph-validator");
const { LaneExecutor } = require("../runtime/planner/lane-executor");
const router = require("../orquestrador/SKILLS_ROUTER.json");
const chains = require("../orquestrador/SKILL_CHAINS.json");

test("governance uses one deterministic risk taxonomy for security, structure and local work", () => {
  assert.deepEqual(Object.keys(CHANGE_CLASSES), ["trivial", "local", "structural", "integration", "security-compliance", "domain-critical"]);
  assert.deepEqual([...HIGH_RISK_CHANGE_CLASSES], ["structural", "integration", "security-compliance", "domain-critical"]);
  assert.equal(classifyChange({ text: "update authentication permissions" }).changeClass, "security-compliance");
  assert.equal(classifyChange({ text: "refactor module boundaries and remove a cycle" }).changeClass, "structural");
  assert.equal(classifyChange({ text: "fix typo in documentation", paths: ["README.md"] }).changeClass, "trivial");
  assert.deepEqual(classifyChange({ text: "update authentication permissions" }).mandatoryPreCode, ["deep-interview", "skill-preflight", "skill-adr"]);
  assert.deepEqual(router.riskClasses, chains.riskClasses);
  assert.deepEqual(router.riskClasses, CHANGE_CLASSES);
});

test("scope control makes discovery decisions explicit and blocks unjustified work", () => {
  assert.equal(classifyDiscovery({ necessary: true }).classification, "IN_SCOPE");
  assert.equal(classifyDiscovery({ requiredDependency: true, justification: "migration is required by the new column" }).classification, "REQUIRED_DEPENDENCY");
  assert.equal(classifyDiscovery({ requiredDependency: true }).eligible, false);
  assert.equal(classifyDiscovery({ discovered: true }).eligible, false);
  assert.equal(classifyDiscovery({ outOfScope: true }).eligible, false);
});

test("completion eligibility requires evidence for every criterion and passed verification", () => {
  const task = { id: "t1", acceptanceCriteria: ["A", "B"] };
  const evidence = [{ taskId: "t1", acceptanceCriterion: "A", content: "test output" }, { taskId: "t1", acceptanceCriterion: "B", content: "review output" }];
  assert.equal(isTaskCompletionEligible(task, { evidence, verification: { status: "passed" }, executor: "codex", verifier: "codex" }).eligible, true);
  assert.equal(isTaskCompletionEligible(task, { evidence: evidence.slice(0, 1), verification: { status: "passed" } }).eligible, false);
  assert.equal(isTaskCompletionEligible(task, { evidence, verification: { status: "failed" } }).eligible, false);
  assert.equal(isTaskCompletionEligible({ id: "legacy-failed", acceptanceCriteria: [] }, { verification: { status: "failed" } }).eligible, false);
  assert.equal(isTaskCompletionEligible({ id: "legacy", acceptanceCriteria: [] }, { executorClaim: "done" }).eligible, true);
  assert.equal(isTaskCompletionEligible(task, { evidence, verification: { status: "passed" }, executor: "codex", verifier: "codex", deterministic: false }).eligible, false);
});

test("planner preserves scope metadata and rejects discovered or out-of-scope execution", () => {
  const discovered = createSemanticTask({ id: "t1", title: "Refactor", objective: "Improve cohesion", scopeClassification: "DISCOVERED_WORK" });
  assert.equal(discovered.scopeClassification, "DISCOVERED_WORK");
  const result = GraphValidator.validate({ tasks: [discovered], assumptions: [], warnings: [], blockers: [] });
  assert.equal(result.valid, false);
  assert.match(result.blockers.map((b) => b.message).join("\n"), /scope/i);
  assert.throws(() => createSemanticTask({ id: "t2", title: "Migration", objective: "Add table", scopeClassification: "REQUIRED_DEPENDENCY" }), /justification/);
});

test("lane executor refuses discovered work before calling the application", async () => {
  let executions = 0;
  const executor = new LaneExecutor({
    application: { getMission: async () => ({ projectId: "p1" }), executeRun: async () => { executions += 1; } }
  });
  const results = await executor.execute([{ id: "discovered", description: "optional refactor", scopeClassification: "DISCOVERED_WORK" }], "m1");
  assert.equal(executions, 0);
  assert.equal(results.discovered.status, "failed");
  assert.match(results.discovered.error, /scope classification/);
});
