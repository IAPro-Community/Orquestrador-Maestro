"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BatchAnswerCollector } = require("../runtime/planner/batch-answer-collector.js");
const { BatchAnswerApplier } = require("../runtime/planner/batch-answer-applier.js");
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
    activation: opts.activation || null,
    unknownId: opts.unknownId || null
  });
}

test("BatchAnswerCollector: collects answers for a batch", () => {
  const collector = new BatchAnswerCollector();
  const questions = [makeQ("q1"), makeQ("q2")];
  collector.startBatch(questions);
  collector.recordAnswer("q1", "yes");
  collector.recordAnswer("q2", "no");
  const pending = collector.getPendingAnswers();
  assert.equal(pending.size, 2);
  assert.equal(pending.get("q1"), "yes");
  assert.equal(pending.get("q2"), "no");
});

test("BatchAnswerCollector: getPendingAnswers returns copy", () => {
  const collector = new BatchAnswerCollector();
  collector.startBatch([makeQ("q1")]);
  collector.recordAnswer("q1", "yes");
  const pending = collector.getPendingAnswers();
  pending.set("q3", "extra");
  assert.equal(collector.getPendingAnswers().has("q3"), false);
});

test("BatchAnswerCollector: editAnswer replaces previous answer", () => {
  const collector = new BatchAnswerCollector();
  collector.startBatch([makeQ("q1")]);
  collector.recordAnswer("q1", "yes");
  collector.editAnswer("q1", "no");
  assert.equal(collector.getPendingAnswers().get("q1"), "no");
});

test("BatchAnswerCollector: clearPending discards unconfirmed answers", () => {
  const collector = new BatchAnswerCollector();
  collector.startBatch([makeQ("q1")]);
  collector.recordAnswer("q1", "yes");
  collector.clearPending();
  assert.equal(collector.getPendingAnswers().size, 0);
});

test("BatchAnswerCollector: confirmBatch returns confirmed answers", () => {
  const collector = new BatchAnswerCollector();
  collector.startBatch([makeQ("q1"), makeQ("q2")]);
  collector.recordAnswer("q1", "yes");
  collector.recordAnswer("q2", "no");
  const confirmed = collector.confirmBatch();
  assert.equal(confirmed.size, 2);
  assert.equal(confirmed.get("q1"), "yes");
  assert.equal(confirmed.get("q2"), "no");
  assert.equal(collector.getPendingAnswers().size, 0);
});

test("BatchAnswerCollector: cancelBatch discards pending", () => {
  const collector = new BatchAnswerCollector();
  collector.startBatch([makeQ("q1")]);
  collector.recordAnswer("q1", "yes");
  collector.cancelBatch();
  assert.equal(collector.getPendingAnswers().size, 0);
});

test("BatchAnswerApplier: applyConfirmedAnswers creates USER_DECISION records", () => {
  const applier = new BatchAnswerApplier();
  const intentSpec = {
    userDecisions: [],
    unknowns: [
      { id: "u1", dimension: "scope", status: "OPEN", blocking: true },
      { id: "u2", dimension: "auth", status: "OPEN", blocking: true }
    ],
    requirements: [],
    constraints: []
  };
  const questions = [
    makeQ("q1", { unknownId: "u1" }),
    makeQ("q2", { unknownId: "u2" })
  ];
  const answers = new Map([["q1", "fullstack"], ["q2", "public"]]);
  const result = applier.applyConfirmedAnswers(intentSpec, questions, answers);
  assert.equal(result.userDecisions.length, 2);
  assert.ok(result.userDecisions.some((d) => d.includes("fullstack")));
  assert.ok(result.userDecisions.some((d) => d.includes("public")));
});

test("BatchAnswerApplier: transitions unknowns to RESOLVED", () => {
  const applier = new BatchAnswerApplier();
  const intentSpec = {
    userDecisions: [],
    unknowns: [
      { id: "u1", dimension: "scope", status: "OPEN", blocking: true }
    ],
    requirements: [],
    constraints: []
  };
  const questions = [makeQ("q1", { unknownId: "u1" })];
  const answers = new Map([["q1", "fullstack"]]);
  const result = applier.applyConfirmedAnswers(intentSpec, questions, answers);
  const u1 = result.unknowns.find((u) => u.id === "u1");
  assert.equal(u1.status, "RESOLVED");
  assert.equal(u1.metadata.resolvedBy, "USER_DECISION");
  assert.equal(u1.metadata.answer, "fullstack");
});

test("BatchAnswerApplier: returns new object (no mutation)", () => {
  const applier = new BatchAnswerApplier();
  const intentSpec = {
    userDecisions: [],
    unknowns: [{ id: "u1", dimension: "scope", status: "OPEN", blocking: true }],
    requirements: [],
    constraints: []
  };
  const original = { ...intentSpec };
  applier.applyConfirmedAnswers(intentSpec, [makeQ("q1", { unknownId: "u1" })], new Map([["q1", "yes"]]));
  assert.deepEqual(intentSpec.userDecisions, original.userDecisions);
  assert.equal(intentSpec.unknowns[0].status, "OPEN");
});

test("BatchAnswerApplier: maps answers without unknownId to userDecisions only", () => {
  const applier = new BatchAnswerApplier();
  const intentSpec = {
    userDecisions: [],
    unknowns: [],
    requirements: [],
    constraints: []
  };
  const questions = [makeQ("q1")];
  const answers = new Map([["q1", "some answer"]]);
  const result = applier.applyConfirmedAnswers(intentSpec, questions, answers);
  assert.equal(result.userDecisions.length, 1);
  assert.ok(result.userDecisions[0].includes("some answer"));
});
