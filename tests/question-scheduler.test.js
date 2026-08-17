"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scheduleQuestions, evaluateActivation } = require("../runtime/planner/question-scheduler.js");
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

test("scheduleQuestions: returns all active questions sorted by priority", () => {
  const questions = [
    makeQ("q1", { priority: 20 }),
    makeQ("q2", { priority: 5 }),
    makeQ("q3", { priority: 15 })
  ];
  const result = scheduleQuestions(questions, new Map(), {});
  assert.equal(result.length, 3);
  assert.equal(result[0].id, "q2");
  assert.equal(result[1].id, "q3");
  assert.equal(result[2].id, "q1");
});

test("scheduleQuestions: filters by activation condition", () => {
  const questions = [
    makeQ("q1", {
      answerType: "single-choice",
      options: [{ value: "frontend", label: "Frontend" }, { value: "backend", label: "Backend" }]
    }),
    makeQ("q2", {
      activation: { all: [{ questionId: "q1", operator: "in", values: ["frontend"] }] }
    })
  ];
  const answers = new Map([["q1", "backend"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 0);
});

test("scheduleQuestions: activates dependent question when condition met", () => {
  const questions = [
    makeQ("q1", {
      answerType: "single-choice",
      options: [{ value: "frontend", label: "Frontend" }, { value: "fullstack", label: "Fullstack" }]
    }),
    makeQ("q2", {
      activation: { all: [{ questionId: "q1", operator: "in", values: ["frontend", "fullstack"] }] }
    })
  ];
  const answers = new Map([["q1", "fullstack"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q2");
});

test("scheduleQuestions: respects equals operator", () => {
  const questions = [
    makeQ("q1", {
      answerType: "single-choice",
      options: [{ value: "yes", label: "Sim" }, { value: "no", label: "Nao" }]
    }),
    makeQ("q2", {
      activation: { all: [{ questionId: "q1", operator: "equals", values: ["yes"] }] }
    })
  ];
  const answers = new Map([["q1", "yes"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q2");
});

test("scheduleQuestions: respects notEquals operator", () => {
  const questions = [
    makeQ("q1", {
      answerType: "single-choice",
      options: [{ value: "a", label: "A" }, { value: "b", label: "B" }]
    }),
    makeQ("q2", {
      activation: { all: [{ questionId: "q1", operator: "notEquals", values: ["a"] }] }
    })
  ];
  const answers = new Map([["q1", "b"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q2");
});

test("scheduleQuestions: respects notIn operator", () => {
  const questions = [
    makeQ("q1", {
      answerType: "single-choice",
      options: [{ value: "a", label: "A" }, { value: "b", label: "B" }]
    }),
    makeQ("q2", {
      activation: { all: [{ questionId: "q1", operator: "notIn", values: ["a"] }] }
    })
  ];
  const answers = new Map([["q1", "b"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q2");
});

test("scheduleQuestions: respects answered operator", () => {
  const questions = [
    makeQ("q1"),
    makeQ("q2", { activation: { all: [{ questionId: "q1", operator: "answered", values: [] }] } })
  ];
  const answers = new Map([["q1", "something"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q2");
});

test("scheduleQuestions: respects notAnswered operator", () => {
  const questions = [
    makeQ("q1"),
    makeQ("q2", { activation: { all: [{ questionId: "q1", operator: "answered", values: [] }] } })
  ];
  const answers = new Map();
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q1");
});

test("scheduleQuestions: respects all conditions (AND logic)", () => {
  const questions = [
    makeQ("q1", {
      answerType: "single-choice",
      options: [{ value: "a", label: "A" }, { value: "b", label: "B" }]
    }),
    makeQ("q2", {
      answerType: "single-choice",
      options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }]
    }),
    makeQ("q3", {
      activation: {
        all: [
          { questionId: "q1", operator: "equals", values: ["a"] },
          { questionId: "q2", operator: "equals", values: ["x"] }
        ]
      }
    })
  ];
  const answers = new Map([["q1", "a"], ["q2", "x"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q3");
});

test("scheduleQuestions: batchSize limits output", () => {
  const questions = [makeQ("q1"), makeQ("q2"), makeQ("q3"), makeQ("q4"), makeQ("q5")];
  const result = scheduleQuestions(questions, new Map(), {}, { batchSize: 3 });
  assert.equal(result.length, 3);
});

test("scheduleQuestions: excludes already answered questions", () => {
  const questions = [makeQ("q1"), makeQ("q2")];
  const answers = new Map([["q1", "done"]]);
  const result = scheduleQuestions(questions, answers, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "q2");
});

test("scheduleQuestions: prefers blocking questions", () => {
  const questions = [
    makeQ("q1", { blocking: false, priority: 1 }),
    makeQ("q2", { blocking: true, priority: 20 })
  ];
  const result = scheduleQuestions(questions, new Map(), {});
  assert.equal(result[0].id, "q2");
});

test("evaluateActivation: returns true when no activation", () => {
  assert.equal(evaluateActivation(null, new Map()), true);
});

test("evaluateActivation: handles answered operator", () => {
  const cond = { questionId: "q1", operator: "answered", values: [] };
  assert.equal(evaluateActivation(cond, new Map([["q1", "yes"]])), true);
  assert.equal(evaluateActivation(cond, new Map()), false);
});
