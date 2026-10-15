"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluateBehaviorCase, runBehaviorCases } = require("../behavior-harness");

test("behavior harness enforces positive, negative and budget expectations", () => {
  const result = evaluateBehaviorCase({
    id: "git-commit-is-micro",
    intent: "faça um commit dessas alterações",
    expect: {
      primary: "skill-git-workflow",
      selected: ["skill-git-workflow"],
      forbidden: ["skill-multiagent-orchestration", "skill-repo-health"],
      maxSkills: 1,
      complexity: "MICRO",
      maxContextTokens: 1000
    }
  }, {
    primarySkill: "skill-git-workflow",
    selectedSkills: ["skill-git-workflow"],
    complexity: "MICRO",
    estimatedContextTokens: 400
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
});

test("behavior harness reports forbidden skills and excessive routing", () => {
  const result = evaluateBehaviorCase({
    id: "git-commit-no-fanout",
    intent: "git commit",
    expect: {
      primary: "skill-git-workflow",
      forbidden: ["skill-multiagent-orchestration"],
      maxSkills: 1
    }
  }, {
    primarySkill: "skill-git-workflow",
    selectedSkills: ["skill-git-workflow", "skill-multiagent-orchestration"]
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures.map((failure) => failure.code).sort(), [
    "FORBIDDEN_SKILL_SELECTED",
    "SKILL_BUDGET_EXCEEDED"
  ]);
});

test("behavior harness runs async router implementations without coupling to Router v3", async () => {
  const report = await runBehaviorCases([
    {
      id: "issue",
      intent: "resolve a issue 125",
      expect: {
        primary: "skill-issue-resolution",
        selected: ["skill-issue-resolution"],
        forbidden: ["skill-multiagent-orchestration"]
      }
    }
  ], async () => ({
    primarySkill: "skill-issue-resolution",
    selectedSkills: ["skill-issue-resolution"]
  }));

  assert.equal(report.passed, true);
  assert.equal(report.total, 1);
  assert.equal(report.failedCount, 0);
});

test("behavior harness fails closed when context budget is asserted without an estimate", () => {
  const result = evaluateBehaviorCase({
    id: "missing-context-estimate",
    intent: "git commit",
    expect: {
      primary: "skill-git-workflow",
      maxContextTokens: 1000
    }
  }, {
    primarySkill: "skill-git-workflow",
    selectedSkills: ["skill-git-workflow"]
  });

  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.code === "MISSING_CONTEXT_ESTIMATE"));
});

test("behavior harness rejects a primary skill omitted from selected skills", () => {
  const result = evaluateBehaviorCase({
    id: "primary-must-be-selected",
    intent: "resolve issue",
    expect: {
      primary: "skill-issue-resolution"
    }
  }, {
    primarySkill: "skill-issue-resolution",
    selectedSkills: ["skill-systematic-debugging"]
  });

  assert.equal(result.passed, false);
  assert.ok(result.failures.some((failure) => failure.code === "PRIMARY_NOT_SELECTED"));
});

test("behavior harness rejects cases without assertions", () => {
  assert.throws(() => evaluateBehaviorCase({
    id: "empty-expect",
    intent: "anything",
    expect: {}
  }, {}), /at least one assertion/u);
});

test("behavior harness rejects duplicate case ids", async () => {
  await assert.rejects(() => runBehaviorCases([
    {
      id: "duplicate",
      intent: "first",
      expect: { maxSkills: 0 }
    },
    {
      id: "duplicate",
      intent: "second",
      expect: { maxSkills: 0 }
    }
  ], async () => ({ selectedSkills: [] })), /duplicate behavior case id/u);
});
