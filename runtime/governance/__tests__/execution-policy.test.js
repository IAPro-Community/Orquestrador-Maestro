"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { POLICY_MATRIX, validateExecutionPolicy, resolveEffectivePolicy, minimumSufficientWorkflow } = require("../execution-policy");

test("reviewer over-demand is an explicit conflict, not silent interpretation", () => {
  const result = validateExecutionPolicy({ budget: { id: "STANDARD" }, workflow: { reviewers: 3 } });
  assert.equal(result.status, "conflict");
  assert.match(result.reasons[0], /maxReviewers=0/u);
});

test("legitimate narrowing is distinguished from conflict", () => {
  const result = validateExecutionPolicy({ budget: { id: "ASSURANCE" }, workflow: { reviewers: 0, skills: 1 } });
  assert.equal(result.status, "narrowed");
});

test("explicit override resolves skill over-demand without silent expansion", () => {
  const result = validateExecutionPolicy({
    budget: { id: "LEAN" },
    workflow: { skills: 3 },
    explicitOverride: { marker: "proceed with warning", note: "user explicitly requested extra skill" }
  });
  assert.equal(result.status, "override-required");
});

test("quick/standard/deep have really different behavior", () => {
  const quick = resolveEffectivePolicy({ risk: "low", complexity: "simple", workflow: "quick", workstreams: 1 });
  const deep = resolveEffectivePolicy({ risk: "high", complexity: "complex", workflow: "deep", workstreams: 4, highRiskChange: true });
  assert.equal(quick.agents.allowed, 0);
  assert.equal(quick.verification, "focused");
  assert.equal(quick.workflow.fullPipeline, false);
  assert.deepEqual([...quick.workflow.steps], ["executor", "test", "verify"]);
  assert.ok(deep.agents.allowed > quick.agents.allowed);
  assert.equal(deep.verification, "broad");
  assert.equal(deep.workflow.fullPipeline, true);
});

test("risk and complexity stay separate in the effective policy", () => {
  const policy = resolveEffectivePolicy({ risk: "critical", complexity: "simple", workflow: "standard" });
  assert.equal(policy.risk, "critical");
  assert.equal(policy.complexity, "simple");
  assert.equal(policy.tier, "ASSURANCE");
});

test("minimum sufficient workflow avoids full pipeline for trivial work", () => {
  const trivial = minimumSufficientWorkflow({ risk: "low", complexity: "simple", workstreams: 1 });
  assert.equal(trivial.fullPipeline, false);
  const broad = minimumSufficientWorkflow({ risk: "high", complexity: "complex", workstreams: 4, highRiskChange: true });
  assert.equal(broad.fullPipeline, true);
});

test("policy matrix preserves existing authorities", () => {
  assert.equal(POLICY_MATRIX.runtime.LEAN.maxSkills, 1);
  assert.equal(POLICY_MATRIX.runtime.ASSURANCE.maxReviewers, 1);
  assert.equal(POLICY_MATRIX.skillProfiles.fast.allowSubagents, false);
  assert.equal(POLICY_MATRIX.multiagent.Team.agents, "3-6");
});
