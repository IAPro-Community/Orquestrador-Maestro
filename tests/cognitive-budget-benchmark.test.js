"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateCognitiveBudget } = require("../runtime/governance/change-governance");

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
