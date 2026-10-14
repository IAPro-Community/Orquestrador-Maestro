"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateCognitiveBudget, validateCognitiveBudgetConfig, normalizeCognitiveBudgetConfig, COGNITIVE_BUDGET_FIELDS } = require("../runtime/governance/change-governance");

const scenarios = [
  ["A-trivial", { risk: "low", complexity: "simple", changeClass: "trivial" }, "LEAN", 0, 4000, 1],
  ["B-normal", { risk: "low", complexity: "medium", changeClass: "local" }, "STANDARD", 0, 8000, 3],
  ["C-architecture", { risk: "high", complexity: "complex", changeClass: "structural" }, "ASSURANCE", 1, 12000, 3],
  ["D-security", { risk: "critical", complexity: "complex", changeClass: "security-compliance" }, "ASSURANCE", 1, 12000, 3],
  ["E-regression", { risk: "medium", complexity: "complex", changeClass: "local" }, "STANDARD", 0, 8000, 3]
];

test("controlled evolution benchmark classifies scenarios without model calls", () => {
  for (const [id, task, expectedTier, expectedReviewers, expectedTokens, expectedSkills] of scenarios) {
    const budget = evaluateCognitiveBudget(task);
    assert.equal(budget.id, expectedTier, id);
    assert.equal(budget.maxReviewers, expectedReviewers, id);
    assert.equal(budget.contextTokens, expectedTokens, id);
    assert.equal(budget.maxSkills, expectedSkills, id);
  }
});

test("every declared budget field has a declared enforcement site", () => {
  // 1.2.0 contract: no dead configuration. Each field below must be consumed by
  // runtime code (see runtime/governance/change-governance.js header).
  //   contextTokens -> buildReviewPrompt maxTokens
  //   maxSkills     -> blocks BUDGET_CONFLICT in maestro-application.executeRun
  //   maxReviewers  -> number of independent review calls issued
  assert.deepEqual(COGNITIVE_BUDGET_FIELDS, ["contextTokens", "maxSkills", "maxReviewers"]);

  // Removed fields must be rejected instead of silently ignored.
  for (const value of [
    { standard: { maxIntelligentRetries: 1 } },
    { standard: { maxOverheadPercent: 15 } }
  ]) {
    const errors = validateCognitiveBudgetConfig(value);
    assert.ok(errors.length > 0, `dead field must be rejected: ${JSON.stringify(value)}`);
  }
});

test("cognitive budget config validates bounds and rejects unknown fields", () => {
  for (const value of [
    { standard: { contextTokens: -1 } }, { standard: { contextTokens: "12000" } },
    { standard: { contextTokens: Infinity } }, { lean: { maxSkills: 0 } },
    { lean: { maxSkills: 2.5 } }, { assurance: { maxReviewers: 2 } },
    { assurance: { maxReviewers: -1 } },
    { future: { contextTokens: 1000 } }, { standard: { unknown: 1 } }
  ]) assert.ok(validateCognitiveBudgetConfig(value).length > 0);
  assert.throws(() => normalizeCognitiveBudgetConfig({ standard: { maxSkills: 0 } }), /Invalid cognitiveBudget/);
  assert.equal(normalizeCognitiveBudgetConfig({ standard: { maxSkills: 4 } }).standard.maxSkills, 4);
});

test("policy benchmark guarantees at most one reviewer and a single skill in LEAN", () => {
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "simple", changeClass: "trivial" }).maxSkills, 1);
  assert.equal(evaluateCognitiveBudget({ risk: "low", complexity: "medium" }).maxReviewers, 0);
  assert.equal(evaluateCognitiveBudget({ risk: "high" }).maxReviewers, 1);
});