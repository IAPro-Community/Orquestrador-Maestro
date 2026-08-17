"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateQuestionSet } = require("../runtime/planner/question-set-validator.js");
const { createBatchQuestion } = require("../runtime/planner/batch-question.js");

function makeQ(id, opts = {}) {
  return createBatchQuestion({
    id,
    dimension: opts.dimension || `dim-${id}`,
    group: opts.group || "default",
    text: opts.text || `Question ${id}?`,
    answerType: opts.answerType || "boolean",
    options: opts.options || [],
    blocking: opts.blocking !== false,
    priority: opts.priority || 10,
    reason: opts.reason || "",
    activation: opts.activation || null
  });
}

test("validateQuestionSet: valid set passes", () => {
  const questions = [
    makeQ("q1", { answerType: "single-choice", options: [{ value: "a", label: "A" }] }),
    makeQ("q2", { activation: { all: [{ questionId: "q1", operator: "in", values: ["a"] }] } })
  ];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, true);
  assert.equal(result.blockers.length, 0);
});

test("validateQuestionSet: rejects duplicate question IDs", () => {
  const questions = [makeQ("q1"), makeQ("q1")];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "DUPLICATE_QUESTION_ID"));
});

test("validateQuestionSet: rejects dangling activation dependency", () => {
  const questions = [
    makeQ("q1", { activation: { all: [{ questionId: "q99", operator: "in", values: ["a"] }] } })
  ];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "DANGLING_DEPENDENCY"));
});

test("validateQuestionSet: rejects self dependency", () => {
  const questions = [
    makeQ("q1", { activation: { all: [{ questionId: "q1", operator: "in", values: ["a"] }] } })
  ];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "SELF_DEPENDENCY"));
});

test("validateQuestionSet: rejects circular dependency", () => {
  const questions = [
    makeQ("q1", { activation: { all: [{ questionId: "q2", operator: "in", values: ["a"] }] } }),
    makeQ("q2", { activation: { all: [{ questionId: "q1", operator: "in", values: ["b"] }] } })
  ];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "CIRCULAR_DEPENDENCY"));
});

test("validateQuestionSet: rejects unsupported operator", () => {
  const questions = [
    makeQ("q1", { activation: { all: [{ questionId: "q2", operator: "gt", values: [5] }] } })
  ];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "UNSUPPORTED_OPERATOR"));
});

test("validateQuestionSet: rejects single-choice without options", () => {
  const questions = [{ id: "q1", dimension: "scope", text: "x", answerType: "single-choice", options: [], blocking: true, priority: 10, activation: null }];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "MISSING_OPTIONS"));
});

test("validateQuestionSet: rejects multi-choice without options", () => {
  const questions = [{ id: "q1", dimension: "scope", text: "x", answerType: "multi-choice", options: [], blocking: true, priority: 10, activation: null }];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "MISSING_OPTIONS"));
});

test("validateQuestionSet: rejects duplicate option values", () => {
  const questions = [{ id: "q1", dimension: "scope", text: "x", answerType: "single-choice", options: [{ value: "a", label: "A" }, { value: "a", label: "B" }], blocking: true, priority: 10, activation: null }];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "DUPLICATE_OPTION_VALUES"));
});

test("validateQuestionSet: detects dependency cycle via DFS", () => {
  const questions = [
    makeQ("q1", { activation: { all: [{ questionId: "q3", operator: "in", values: ["x"] }] } }),
    makeQ("q2", { activation: { all: [{ questionId: "q1", operator: "in", values: ["x"] }] } }),
    makeQ("q3", { activation: { all: [{ questionId: "q2", operator: "in", values: ["x"] }] } })
  ];
  const result = validateQuestionSet(questions);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "CIRCULAR_DEPENDENCY"));
});

test("validateQuestionSet: empty set is valid", () => {
  const result = validateQuestionSet([]);
  assert.equal(result.valid, true);
});

test("validateQuestionSet: null/undefined input is valid", () => {
  assert.equal(validateQuestionSet(null).valid, true);
  assert.equal(validateQuestionSet(undefined).valid, true);
});
