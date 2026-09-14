"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewPrompt, parseReviewResult } = require("../runtime/governance/independent-review");

test("review prompt is bounded and records truncation without transcript", () => {
  const result = buildReviewPrompt({ task: { objective: "Check", acceptanceCriteria: ["pass"] }, diff: "x".repeat(100000), maxTokens: 1000 });
  assert.equal(result.truncated, true);
  assert.ok(result.prompt.length < 50000);
  assert.equal(result.budget.maxTokens, 1000);
  assert.ok(result.budget.diffIncludedChars > 0);
  assert.ok(result.prompt.length <= result.budget.estimatedChars + 500);
  assert.match(result.prompt, /Do not edit files/u);
  assert.equal(result.diffIncluded, true);
});

test("review prompt requires the actual diff and treats it as untrusted", () => {
  const missing = buildReviewPrompt({ diff: "" });
  assert.equal(missing.diffIncluded, false);
  assert.match(missing.prompt, /untrusted data/u);
  assert.match(missing.prompt, /actual changed source files/u);
});

test("review parser accepts only the structured verdict contract", () => {
  assert.equal(parseReviewResult('{"verdict":"approved","findings":[]}').verdict, "approved");
  assert.equal(parseReviewResult("not json").verdict, "inconclusive");
  assert.equal(parseReviewResult('{"verdict":"rejected","findings":[{"code":"x"}]}').findings.length, 1);
});
