"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBatchQuestion } = require("../runtime/planner/batch-question.js");

test("createBatchQuestion: creates valid question with all fields", () => {
  const q = createBatchQuestion({
    id: "q1",
    unknownId: "u1",
    dimension: "scope",
    group: "scope",
    text: "Qual o escopo do projeto?",
    answerType: "single-choice",
    options: [
      { value: "backend", label: "Somente backend" },
      { value: "frontend", label: "Somente frontend" },
      { value: "fullstack", label: "Backend + frontend" }
    ],
    blocking: true,
    priority: 1,
    reason: "Define quais camadas serao planejadas",
    evidenceKeys: [],
    activation: null
  });
  assert.equal(q.id, "q1");
  assert.equal(q.unknownId, "u1");
  assert.equal(q.dimension, "scope");
  assert.equal(q.group, "scope");
  assert.equal(q.text, "Qual o escopo do projeto?");
  assert.equal(q.answerType, "single-choice");
  assert.equal(q.options.length, 3);
  assert.equal(q.blocking, true);
  assert.equal(q.priority, 1);
  assert.equal(q.reason, "Define quais camadas serao planejadas");
  assert.deepEqual(q.evidenceKeys, []);
  assert.equal(q.activation, null);
});

test("createBatchQuestion: rejects missing id", () => {
  assert.throws(() => createBatchQuestion({ dimension: "scope", text: "x", answerType: "boolean" }), /id/);
});

test("createBatchQuestion: rejects missing dimension", () => {
  assert.throws(() => createBatchQuestion({ id: "q1", text: "x", answerType: "boolean" }), /dimension/);
});

test("createBatchQuestion: rejects missing text", () => {
  assert.throws(() => createBatchQuestion({ id: "q1", dimension: "scope", answerType: "boolean" }), /text/);
});

test("createBatchQuestion: rejects invalid answerType", () => {
  assert.throws(() => createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "date" }), /answerType/);
});

test("createBatchQuestion: accepts text answerType without options", () => {
  const q = createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "text" });
  assert.equal(q.answerType, "text");
  assert.deepEqual(q.options, []);
});

test("createBatchQuestion: rejects single-choice without options", () => {
  assert.throws(() => createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "single-choice" }), /option/i);
});

test("createBatchQuestion: rejects duplicate option values", () => {
  assert.throws(() => createBatchQuestion({
    id: "q1", dimension: "scope", text: "x", answerType: "single-choice",
    options: [{ value: "a", label: "A" }, { value: "a", label: "B" }]
  }), /duplicate/i);
});

test("createBatchQuestion: creates valid activation condition", () => {
  const q = createBatchQuestion({
    id: "q2",
    unknownId: "u2",
    dimension: "frontend-framework",
    group: "frontend",
    text: "Framework?",
    answerType: "single-choice",
    options: [{ value: "react", label: "React" }],
    blocking: true,
    priority: 2,
    reason: "Needed for frontend",
    activation: {
      all: [{ questionId: "q1", operator: "in", values: ["frontend", "fullstack"] }]
    }
  });
  assert.deepEqual(q.activation, {
    all: [{ questionId: "q1", operator: "in", values: ["frontend", "fullstack"] }]
  });
});

test("createBatchQuestion: frozen object", () => {
  const q = createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "boolean" });
  assert.throws(() => { q.id = "changed"; });
});

test("createBatchQuestion: defaults blocking to true", () => {
  const q = createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "boolean" });
  assert.equal(q.blocking, true);
});

test("createBatchQuestion: defaults priority to 10", () => {
  const q = createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "boolean" });
  assert.equal(q.priority, 10);
});

test("createBatchQuestion: defaults answerType to text", () => {
  const q = createBatchQuestion({ id: "q1", dimension: "scope", text: "x" });
  assert.equal(q.answerType, "text");
});
