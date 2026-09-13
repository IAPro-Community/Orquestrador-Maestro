"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  CHANGE_CLASSES,
  HIGH_RISK_CHANGE_CLASSES,
  classifyChange,
  classifyDiscovery,
  isRiskExecutionEligible,
  evaluateCognitiveBudget,
  isTaskCompletionEligible
} = require("../runtime/governance/change-governance");
const { createSemanticTask } = require("../runtime/planner/task-graph-proposal");
const { GraphValidator } = require("../runtime/planner/graph-validator");
const { LaneExecutor } = require("../runtime/planner/lane-executor");
const { LegacyExecutionProjection } = require("../runtime/planner/legacy-execution-projection");
const router = require("../orquestrador/SKILLS_ROUTER.json");
const chains = require("../orquestrador/SKILL_CHAINS.json");

test("governance uses one deterministic risk taxonomy for security, structure and local work", () => {
  assert.deepEqual(Object.keys(CHANGE_CLASSES), ["trivial", "local", "structural", "integration", "security-compliance", "domain-critical"]);
  assert.deepEqual([...HIGH_RISK_CHANGE_CLASSES], ["structural", "integration", "security-compliance", "domain-critical"]);
  assert.equal(classifyChange({ text: "update authentication permissions" }).changeClass, "security-compliance");
  assert.equal(classifyChange({ text: "refactor module boundaries and remove a cycle" }).changeClass, "structural");
  assert.equal(classifyChange({ text: "fix typo in documentation", paths: ["README.md"] }).changeClass, "trivial");
  assert.deepEqual(classifyChange({ text: "update authentication permissions" }).mandatoryPreCode, ["deep-interview", "skill-preflight", "skill-adr"]);
  assert.deepEqual(Object.keys(router.riskClasses.classes), ["trivial", "local", "structural", "integration", "security-compliance", "domain-critical"]);
  for (const [cls, entry] of Object.entries(router.riskClasses.classes)) {
    assert.ok(Array.isArray(entry.required), `${cls} must have a required array`);
  }
  const routerRequired = Object.fromEntries(Object.entries(router.riskClasses.classes).map(([k, v]) => [k, { mandatoryPreCode: v.required }]));
  assert.deepEqual(routerRequired, chains.riskClasses);
  assert.deepEqual(routerRequired, CHANGE_CLASSES);
  const routerSource = fs.readFileSync(path.join(__dirname, "..", "orquestrador/SKILLS_ROUTER.json"), "utf8");
  assert.equal((routerSource.match(/"riskClasses"\s*:/g) || []).length, 1);
  assert.equal(isRiskExecutionEligible("security-compliance", { profileId: "developer" }), false);
  assert.equal(isRiskExecutionEligible("security-compliance", { profileId: "developer", riskOverride: { marker: "proceed with warning", note: "reviewed" } }), true);
});

test("cognitive budget is deterministic and proportional to risk", () => {
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "simple", changeClass: "trivial" }).id, "LEAN");
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "medium", changeClass: "local" }).id, "STANDARD");
  const assurance = evaluateCognitiveBudget({ risk: "high", complexity: "complex", changeClass: "security-compliance" });
  assert.equal(assurance.id, "ASSURANCE");
  assert.equal(assurance.reviewRequirement, "independent");
  assert.equal(assurance.humanApproval, false);
  assert.equal(evaluateCognitiveBudget({ risk: "critical" }).humanApproval, true);
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "simple" }, { lean: { contextTokens: 1234 } }).contextTokens, 1234);
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

test("completion eligibility also enforces explicitly declared evidence requirements", () => {
  const task = { id: "t1", objective: "Build feature", evidenceRequirements: ["test output"] };
  assert.equal(isTaskCompletionEligible(task, { verification: { status: "passed" } }).eligible, false);
  assert.deepEqual(isTaskCompletionEligible(task, { verification: { status: "passed" } }).missingEvidenceRequirements, ["test output"]);
  assert.equal(isTaskCompletionEligible(task, { evidence: [{ taskId: "t1", acceptanceCriterion: "test output", content: "ok" }], verification: { status: "passed" } }).eligible, true);
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

test("lane executor forwards semantic metadata from legacy projections", async () => {
  const semantic = createSemanticTask({
    id: "semantic-auth",
    title: "Authentication",
    objective: "Add authentication",
    changeClass: "security-compliance",
    scopeClassification: "DISCOVERED_WORK"
  });
  const projected = LegacyExecutionProjection.projectTask(semantic, { executionTarget: { providerId: "fake", model: "default" } });
  let request;
  const executor = new LaneExecutor({
    application: {
      getMission: async () => ({ projectId: "p1" }),
      executeRun: async (value) => { request = value; return { run: { status: "completed" } }; }
    }
  });
  const results = await executor.execute([projected], "m1");
  assert.equal(results[semantic.id].status, "failed");
  assert.equal(request, undefined);

  const inScope = createSemanticTask({ ...semantic, id: "semantic-auth-in-scope", scopeClassification: "IN_SCOPE" });
  const inScopeProjection = LegacyExecutionProjection.projectTask(inScope, { executionTarget: { providerId: "fake", model: "default" } });
  const forwarded = [];
  const inScopeExecutor = new LaneExecutor({
    application: {
      getMission: async () => ({ projectId: "p1" }),
      executeRun: async (value) => { forwarded.push(value.semanticTask); return { run: { status: "completed" } }; }
    }
  });
  await inScopeExecutor.execute([inScopeProjection], "m1");
  assert.deepEqual(forwarded[0], inScope);
});

test("lane executor settles dependents after a scope block", async () => {
  const executor = new LaneExecutor({
    application: { getMission: async () => ({ projectId: "p1" }), executeRun: async () => ({}) }
  });
  const result = await Promise.race([
    executor.execute([
      { id: "blocked", description: "out", scopeClassification: "DISCOVERED_WORK" },
      { id: "dependent", description: "depends", dependsOn: ["blocked"] }
    ], "m1"),
    new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 200))
  ]);
  assert.notEqual(result, "TIMEOUT");
  assert.equal(result.blocked.status, "failed");
  assert.match(result.dependent.error, /failed dependency/);
});
