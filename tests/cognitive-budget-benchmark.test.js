"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateCognitiveBudget, validateCognitiveBudgetConfig, normalizeCognitiveBudgetConfig } = require("../runtime/governance/change-governance");

const scenarios = [
  ["A-trivial", { risk: "low", complexity: "simple", changeClass: "trivial" }, "LEAN", 0],
  ["B-normal", { risk: "low", complexity: "medium", changeClass: "local" }, "STANDARD", 0],
  ["C-architecture", { risk: "high", complexity: "complex", changeClass: "structural" }, "ASSURANCE", 1],
  ["D-security", { risk: "critical", complexity: "complex", changeClass: "security-compliance" }, "ASSURANCE", 1],
  ["E-regression", { risk: "medium", complexity: "complex", changeClass: "local" }, "STANDARD", 0]
];

test("controlled evolution benchmark classifies scenarios without model calls", () => {
  for (const [id, task, expectedTier, expectedReviewers] of scenarios) {
    const budget = evaluateCognitiveBudget(task);
    assert.equal(budget.id, expectedTier, id);
    assert.equal(budget.maxReviewers, expectedReviewers, id);
    assert.equal(budget.maxIntelligentRetries >= 0, true, id);
  }
});

test("standard budget keeps the overhead target configurable rather than universal", () => {
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "medium" }).maxOverheadPercent, 15);
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "medium" }, { standard: { maxOverheadPercent: 10 } }).maxOverheadPercent, 10);
});

test("cognitive budget config validates bounds and rejects unknown fields", () => {
  for (const value of [
    { standard: { contextTokens: -1 } }, { standard: { contextTokens: "12000" } },
    { standard: { contextTokens: Infinity } }, { lean: { maxSkills: 0 } },
    { lean: { maxSkills: 2.5 } }, { assurance: { maxReviewers: 2 } },
    { assurance: { maxReviewers: -1 } }, { standard: { maxIntelligentRetries: -1 } },
    { standard: { maxOverheadPercent: 101 } }, { standard: { maxOverheadPercent: -1 } },
    { future: { contextTokens: 1000 } }, { standard: { unknown: 1 } }
  ]) assert.ok(validateCognitiveBudgetConfig(value).length > 0);
  assert.throws(() => normalizeCognitiveBudgetConfig({ standard: { maxSkills: 0 } }), /Invalid cognitiveBudget/);
  assert.equal(normalizeCognitiveBudgetConfig({ standard: { maxSkills: 4 } }).standard.maxSkills, 4);
});

test("policy benchmark guarantees no automatic retries and at most one reviewer", () => {
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "simple", changeClass: "trivial" }).maxIntelligentRetries, 0);
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "medium" }).maxReviewers, 0);
  assert.equal(evaluateCognitiveBudget({ risk: "high" }).maxReviewers, 1);
});
