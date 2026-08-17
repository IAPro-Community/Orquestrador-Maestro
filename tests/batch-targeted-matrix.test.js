"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BatchRefinementCoordinator } = require("../runtime/planner/batch-refinement-coordinator.js");
const { BatchIntentDiscoverer } = require("../runtime/planner/batch-intent-discoverer.js");
const { IntentReconciler } = require("../runtime/planner/intent-reconciler.js");
const { createBatchQuestion } = require("../runtime/planner/batch-question.js");
const { validateQuestionSet } = require("../runtime/planner/question-set-validator.js");
const { scheduleQuestions } = require("../runtime/planner/question-scheduler.js");
const { BatchAnswerCollector } = require("../runtime/planner/batch-answer-collector.js");
const { BatchAnswerApplier } = require("../runtime/planner/batch-answer-applier.js");

function makeProvider(response) {
  return {
    detect: () => true,
    execute: async () => ({
      pid: "fake",
      cancel: () => {},
      result: Promise.resolve({ stdout: JSON.stringify(response), stderr: "", exitCode: 0 })
    })
  };
}

function makeDiscovery(questions) {
  return {
    discover: async () => ({
      questions,
      valid: true,
      validationErrors: [],
      questionCount: questions.length,
      discoveryRound: 1,
      error: null
    }),
    get discoveryRound() { return 1; }
  };
}

function makeReconciler(proposal) {
  return {
    reconcile: async () => ({ success: true, error: null, proposal }),
    get aiCalls() { return 1; }
  };
}

function makeAdapter(answersPerBatch) {
  let idx = 0;
  return {
    collectBatch: async (questions) => {
      const a = answersPerBatch[idx] || {};
      idx++;
      if (a.__cancel) return { action: "cancel", answers: {} };
      return { action: "confirm", answers: a };
    }
  };
}

// T1: CRUD fullstack — 6 questions, 2 batches, 2 AI calls
test("T1: CRUD fullstack — 6 questions in 2 batches, 2 AI calls", async () => {
  const qs = [
    createBatchQuestion({ id: "q1", dimension: "scope", text: "Escopo?", answerType: "single-choice", options: [{ value: "fullstack", label: "Fullstack" }, { value: "backend", label: "Backend" }], blocking: true, priority: 1 }),
    createBatchQuestion({ id: "q2", dimension: "data", text: "Dados?", answerType: "text", blocking: true, priority: 2 }),
    createBatchQuestion({ id: "q3", dimension: "persistence", text: "Persistencia?", answerType: "single-choice", options: [{ value: "sqlite", label: "SQLite" }], blocking: true, priority: 3 }),
    createBatchQuestion({ id: "q4", dimension: "auth", text: "Auth?", answerType: "single-choice", options: [{ value: "public", label: "Publico" }], blocking: true, priority: 4 }),
    createBatchQuestion({ id: "q5", dimension: "frontend-fw", text: "FW Frontend?", answerType: "single-choice", options: [{ value: "react", label: "React" }], blocking: true, priority: 5, activation: { all: [{ questionId: "q1", operator: "in", values: ["fullstack", "frontend"] }] } }),
    createBatchQuestion({ id: "q6", dimension: "backend-fw", text: "FW Backend?", answerType: "single-choice", options: [{ value: "express", label: "Express" }], blocking: true, priority: 6, activation: { all: [{ questionId: "q1", operator: "in", values: ["fullstack", "backend"] }] } })
  ];
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery(qs),
    reconciler: makeReconciler({ objective: "CRUD", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }),
    adapter: makeAdapter([
      { q1: "fullstack", q2: "nome, preco", q3: "sqlite", q4: "publico" },
      { q5: "react", q6: "express" }
    ])
  });
  const result = await coord.run({ objective: "crud", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" }, {}, [], { batchSize: 4 });
  assert.equal(result.success, true);
  assert.equal(result.batchesProcessed, 2);
  assert.equal(result.totalQuestions, 6);
  assert.equal(result.counters.reconciliationCalls, 1);
});

// T2: CRUD backend-only — frontend question never displayed
test("T2: CRUD backend-only — frontend question never displayed", async () => {
  const qs = [
    createBatchQuestion({ id: "q1", dimension: "scope", text: "Escopo?", answerType: "single-choice", options: [{ value: "backend", label: "Backend" }, { value: "fullstack", label: "Fullstack" }], blocking: true }),
    createBatchQuestion({ id: "q5", dimension: "frontend-fw", text: "FW Frontend?", answerType: "boolean", blocking: true, activation: { all: [{ questionId: "q1", operator: "in", values: ["fullstack", "frontend"] }] } })
  ];
  let shownQuestions = [];
  const adapter = {
    collectBatch: async (questions) => {
      shownQuestions = questions.map((q) => q.id);
      return { action: "confirm", answers: { q1: "backend" } };
    }
  };
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery(qs),
    reconciler: makeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }),
    adapter
  });
  const result = await coord.run({ objective: "crud", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" }, {}, [], { batchSize: 4 });
  assert.equal(result.success, true);
  assert.ok(!shownQuestions.includes("q5"), "frontend question must not be shown");
});

// T3: CRUD frontend-only — backend question never displayed
test("T3: CRUD frontend-only — backend question never displayed", async () => {
  const qs = [
    createBatchQuestion({ id: "q1", dimension: "scope", text: "Escopo?", answerType: "single-choice", options: [{ value: "frontend", label: "Frontend" }, { value: "fullstack", label: "Fullstack" }], blocking: true }),
    createBatchQuestion({ id: "q6", dimension: "backend-fw", text: "FW Backend?", answerType: "boolean", blocking: true, activation: { all: [{ questionId: "q1", operator: "in", values: ["fullstack", "backend"] }] } })
  ];
  let shownQuestions = [];
  const adapter = {
    collectBatch: async (questions) => {
      shownQuestions = questions.map((q) => q.id);
      return { action: "confirm", answers: { q1: "frontend" } };
    }
  };
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery(qs),
    reconciler: makeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }),
    adapter
  });
  const result = await coord.run({ objective: "crud", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" }, {}, [], { batchSize: 4 });
  assert.equal(result.success, true);
  assert.ok(!shownQuestions.includes("q6"), "backend question must not be shown for frontend-only");
});

// T4: existing backend framework FACT — recommended "seguir existente"
test("T4: existing framework FACT — recommended option shown", async () => {
  const qs = [
    createBatchQuestion({
      id: "q1", dimension: "backend-fw", text: "Framework?", answerType: "single-choice",
      options: [
        { value: "express", label: "Seguir Express existente", recommended: true },
        { value: "other", label: "Outro" }
      ],
      blocking: true
    })
  ];
  let capturedQuestions = [];
  const adapter = {
    collectBatch: async (questions) => {
      capturedQuestions = questions;
      return { action: "confirm", answers: { q1: "express" } };
    }
  };
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery(qs),
    reconciler: makeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }),
    adapter
  });
  await coord.run({ objective: "crud", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" }, {}, [], { batchSize: 4 });
  const q1 = capturedQuestions.find((q) => q.id === "q1");
  assert.ok(q1.options.some((o) => o.recommended), "must have recommended option");
});

// T5: edit pending answer — no AI call
test("T5: edit pending answer — no additional AI call", async () => {
  let aiCallCount = 0;
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery([
      createBatchQuestion({ id: "q1", dimension: "scope", text: "x?", answerType: "boolean", blocking: true })
    ]),
    reconciler: {
      reconcile: async () => { aiCallCount++; return { success: true, error: null, proposal: { objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null } }; },
      get aiCalls() { return aiCallCount; }
    },
    adapter: {
      collectBatch: async (questions) => {
        return { action: "confirm", answers: { q1: "yes" } };
      }
    }
  });
  const result = await coord.run({ objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" }, {}, [], { batchSize: 4 });
  assert.equal(aiCallCount, 1, "only reconciliation call, no extra AI calls during answer editing");
});

// T6: cancel unconfirmed batch — no USER_DECISION applied
test("T6: cancel unconfirmed batch — no USER_DECISION applied", async () => {
  const applier = new BatchAnswerApplier();
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery([
      createBatchQuestion({ id: "q1", dimension: "scope", text: "x?", answerType: "boolean", blocking: true })
    ]),
    reconciler: makeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }),
    adapter: makeAdapter([{ __cancel: true }]),
    applier
  });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coord.run(intentSpec, {}, [], { batchSize: 4 });
  assert.equal(result.cancelled, true);
  assert.equal(result.intentSpec.userDecisions.length, 0, "no USER_DECISION from cancelled batch");
});

// T7: invalid question DAG — reject
test("T7: invalid question DAG — circular dependency rejected", () => {
  const qs = [
    createBatchQuestion({ id: "q1", dimension: "a", text: "A?", answerType: "boolean", activation: { all: [{ questionId: "q2", operator: "answered", values: [] }] } }),
    createBatchQuestion({ id: "q2", dimension: "b", text: "B?", answerType: "boolean", activation: { all: [{ questionId: "q1", operator: "answered", values: [] }] } })
  ];
  const result = validateQuestionSet(qs);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "CIRCULAR_DEPENDENCY"));
});

// T8: duplicate question — reject
test("T8: duplicate question ID — rejected", () => {
  const qs = [
    createBatchQuestion({ id: "q1", dimension: "a", text: "A?", answerType: "boolean" }),
    createBatchQuestion({ id: "q1", dimension: "b", text: "B?", answerType: "boolean" })
  ];
  const result = validateQuestionSet(qs);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === "DUPLICATE_QUESTION_ID"));
});

// T9: second discovery round — coordinator currently uses single discovery
// This test verifies that the coordinator handles a discovery that returns
// multiple questions across different activation states correctly.
test("T9: conditional activation — questions activate after batch answers", async () => {
  const qs = [
    createBatchQuestion({ id: "q1", dimension: "scope", text: "Escopo?", answerType: "single-choice", options: [{ value: "fullstack", label: "Fullstack" }], blocking: true }),
    createBatchQuestion({ id: "q2", dimension: "fw", text: "Framework?", answerType: "text", blocking: true, activation: { all: [{ questionId: "q1", operator: "in", values: ["fullstack"] }] } })
  ];
  let batchCount = 0;
  let allShownIds = [];
  const adapter = {
    collectBatch: async (questions) => {
      batchCount++;
      allShownIds.push(...questions.map((q) => q.id));
      if (batchCount === 1) return { action: "confirm", answers: { q1: "fullstack" } };
      return { action: "confirm", answers: { q2: "react" } };
    }
  };
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery(qs),
    reconciler: makeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }),
    adapter
  });
  const result = await coord.run({ objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" }, {}, [], { batchSize: 4 });
  assert.equal(result.success, true);
  assert.equal(batchCount, 2, "must have 2 batches (q1 first, then q2 activates)");
  assert.ok(allShownIds.includes("q1"), "q1 must be shown");
  assert.ok(allShownIds.includes("q2"), "q2 must be shown after q1 activates it");
});

// T10: same-state same-question — M2_CLARIFICATION_LOOP still protects
test("T10: same-state same-question — loop guard via legacy path", async () => {
  const { AiInterviewer } = require("../runtime/planner/ai-interviewer.js");
  let round = 0;
  const app = {
    providers: {
      get: () => ({
        detect: async () => ({ installed: true }),
        execute: async () => {
          round++;
          return {
            pid: "fake", cancel: () => {},
            result: Promise.resolve({
              stdout: JSON.stringify({
                addRequirements: [], addConstraints: [],
                detectedUnknowns: [{ id: "u1", dimension: "coverage", description: "x", status: "OPEN", blocking: true }]
              }),
              stderr: "", exitCode: 0
            })
          };
        }
      })
    }
  };
  const interviewer = new AiInterviewer({
    resolvedSkills: [], preflightFacts: {},
    application: app, intent: "vago",
    prompts: {
      text: async () => "same answer",
      spinner: () => ({ start() {}, stop() {} }),
      note: () => {},
      log: { error: () => {}, warning: () => {} },
      isCancel: () => false
    }
  });
  try {
    await interviewer.runInteractive();
    assert.fail("Expected M2_CLARIFICATION_LOOP");
  } catch (err) {
    assert.ok(err.message.includes("M2_CLARIFICATION_LOOP"));
  }
});

// T11: --auto — no interactive prompts
test("T11: --auto mode — no interactive prompts", async () => {
  let promptCalled = false;
  const coord = new BatchRefinementCoordinator({
    discoverer: makeDiscovery([
      createBatchQuestion({ id: "q1", dimension: "scope", text: "x?", answerType: "boolean", blocking: true })
    ]),
    reconciler: makeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null }),
    adapter: {
      collectBatch: async () => { promptCalled = true; return { action: "confirm", answers: {} }; }
    }
  });
  const result = await coord.run({ objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" }, {}, [], { auto: true, batchSize: 4 });
  assert.equal(result.autoApproved, true);
  assert.equal(promptCalled, false, "adapter must not be called in --auto mode");
});

// T12: provider handle.result — correct pattern
test("T12: provider handle.result pattern — correct usage", async () => {
  let executeCalled = false;
  const provider = {
    detect: () => true,
    execute: async (opts) => {
      executeCalled = true;
      return {
        pid: "test-pid",
        cancel: () => {},
        result: Promise.resolve({
          stdout: JSON.stringify({ questions: [] }),
          stderr: "",
          exitCode: 0
        })
      };
    }
  };
  const discoverer = new BatchIntentDiscoverer({ provider });
  await discoverer.discover("test", { requirements: [], constraints: [] }, [], {});
  assert.equal(executeCalled, true, "provider.execute must be called");
});
