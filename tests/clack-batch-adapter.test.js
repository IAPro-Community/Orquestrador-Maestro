"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ClackBatchInteractionAdapter } = require("../runtime/planner/clack-batch-adapter.js");
const { createBatchQuestion } = require("../runtime/planner/batch-question.js");

function makeQ(id, opts = {}) {
  return createBatchQuestion({
    id,
    dimension: opts.dimension || `dim-${id}`,
    group: opts.group || "scope",
    text: opts.text || `Question ${id}?`,
    answerType: opts.answerType || "boolean",
    options: opts.options || [],
    blocking: opts.blocking !== false,
    priority: opts.priority || 10,
    reason: opts.reason || "Important decision",
    activation: opts.activation || null,
    unknownId: opts.unknownId || null
  });
}

function makeMockPrompts(responses) {
  let callIndex = 0;
  return {
    select: async ({ message, options }) => {
      const resp = responses[callIndex++];
      if (resp && resp.__cancel) return Symbol.for("clack:cancel");
      return resp ? resp.value : options[0].value;
    },
    confirm: async ({ message }) => {
      const resp = responses[callIndex++];
      if (resp && resp.__cancel) return Symbol.for("clack:cancel");
      return resp ? resp.value : true;
    },
    isCancel: (val) => val === Symbol.for("clack:cancel"),
    cancel: () => {},
    log: { success: () => {}, info: () => {}, error: () => {}, warning: () => {} },
    note: () => {}
  };
}

test("ClackBatchInteractionAdapter: collects batch answers", async () => {
  const questions = [
    makeQ("q1", { text: "Escopo?", answerType: "single-choice", options: [
      { value: "backend", label: "Backend" }, { value: "fullstack", label: "Fullstack" }
    ]}),
    makeQ("q2", { text: "Dados?", answerType: "boolean" })
  ];
  const mockPrompts = makeMockPrompts([
    { value: "fullstack" },
    { value: true },
    { value: "confirm" }
  ]);
  const adapter = new ClackBatchInteractionAdapter({ prompts: mockPrompts });
  const result = await adapter.collectBatch(questions, { batchNumber: 1, totalQuestions: 2, answeredCount: 0 });
  assert.equal(result.action, "confirm");
  assert.equal(result.answers.q1, "fullstack");
  assert.equal(result.answers.q2, true);
});

test("ClackBatchInteractionAdapter: cancel returns cancelled", async () => {
  const questions = [makeQ("q1", { text: "x?", answerType: "boolean" })];
  const mockPrompts = makeMockPrompts([{ __cancel: true }]);
  const adapter = new ClackBatchInteractionAdapter({ prompts: mockPrompts });
  const result = await adapter.collectBatch(questions, { batchNumber: 1, totalQuestions: 1, answeredCount: 0 });
  assert.equal(result.action, "cancel");
});

test("ClackBatchInteractionAdapter: shows progress header", async () => {
  let headerShown = false;
  const questions = [makeQ("q1", { text: "x?" })];
  const mockPrompts = makeMockPrompts([{ value: true }]);
  mockPrompts.note = (msg, title) => { if (title && title.includes("Refinamento")) headerShown = true; };
  const adapter = new ClackBatchInteractionAdapter({ prompts: mockPrompts });
  await adapter.collectBatch(questions, { batchNumber: 1, totalQuestions: 4, answeredCount: 2 });
  assert.equal(headerShown, true);
});

test("ClackBatchInteractionAdapter: single-choice renders options", async () => {
  const questions = [makeQ("q1", {
    text: "Framework?",
    answerType: "single-choice",
    options: [
      { value: "react", label: "React", recommended: true },
      { value: "vue", label: "Vue" }
    ],
    reason: "Define stack frontend"
  })];
  const mockPrompts = makeMockPrompts([{ value: "react" }]);
  const adapter = new ClackBatchInteractionAdapter({ prompts: mockPrompts });
  const result = await adapter.collectBatch(questions, { batchNumber: 1, totalQuestions: 1, answeredCount: 0 });
  assert.equal(result.answers.q1, "react");
});

test("ClackBatchInteractionAdapter: text answer type uses text prompt", async () => {
  const questions = [makeQ("q1", { text: "Nome do projeto?", answerType: "text" })];
  let textPromptCalled = false;
  const mockPrompts = {
    select: async ({ message, options }) => {
      return "confirm";
    },
    text: async () => { textPromptCalled = true; return "meu-crud"; },
    confirm: async () => true,
    isCancel: (v) => v === Symbol.for("clack:cancel"),
    cancel: () => {},
    log: { success: () => {}, info: () => {}, error: () => {}, warning: () => {} },
    note: () => {}
  };
  const adapter = new ClackBatchInteractionAdapter({ prompts: mockPrompts });
  const result = await adapter.collectBatch(questions, { batchNumber: 1, totalQuestions: 1, answeredCount: 0 });
  assert.equal(result.answers.q1, "meu-crud");
  assert.equal(textPromptCalled, true);
});
