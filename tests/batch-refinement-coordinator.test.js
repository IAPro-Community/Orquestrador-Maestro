"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BatchRefinementCoordinator } = require("../runtime/planner/batch-refinement-coordinator.js");
const { createBatchQuestion } = require("../runtime/planner/batch-question.js");

function makeFakeDiscoverer(questions) {
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

function makeFakeReconciler(proposal) {
  return {
    reconcile: async () => ({ success: true, error: null, proposal }),
    get aiCalls() { return 1; }
  };
}

function makeFakeAdapter(answersPerBatch) {
  let batchIndex = 0;
  return {
    collectBatch: async (questions, state) => {
      const answers = answersPerBatch[batchIndex] || {};
      batchIndex++;
      if (answers.__cancel) return { action: "cancel", answers: {} };
      return { action: "confirm", answers };
    }
  };
}

test("BatchRefinementCoordinator: full flow with 2 batches", async () => {
  const q1 = createBatchQuestion({
    id: "q1", dimension: "scope", text: "Escopo?", answerType: "single-choice",
    options: [{ value: "fullstack", label: "Fullstack" }], blocking: true
  });
  const q2 = createBatchQuestion({
    id: "q2", dimension: "data", text: "Dados?", answerType: "boolean", blocking: true
  });
  const q3 = createBatchQuestion({
    id: "q3", dimension: "fw", text: "Framework?", answerType: "boolean",
    activation: { all: [{ questionId: "q1", operator: "in", values: ["fullstack"] }] }, blocking: true
  });

  const discoverer = makeFakeDiscoverer([q1, q2, q3]);
  const reconciler = makeFakeReconciler({
    objective: "Build CRUD",
    addRequirements: ["TypeScript"],
    addConstraints: [],
    detectedUnknowns: [],
    question: null
  });
  const adapter = makeFakeAdapter([
    { q1: "fullstack", q2: "yes" },
    { q3: "react" }
  ]);

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "crud", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, true);
  assert.equal(result.batchesProcessed, 2);
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.reconciled, true);
  assert.ok(result.intentSpec.userDecisions.length > 0);
});

test("BatchRefinementCoordinator: cancel stops flow", async () => {
  const q1 = createBatchQuestion({ id: "q1", dimension: "scope", text: "Escopo?", answerType: "boolean", blocking: true });
  const discoverer = makeFakeDiscoverer([q1]);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null });
  const adapter = makeFakeAdapter([{ __cancel: true }]);

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.batchesProcessed, 0);
});

test("BatchRefinementCoordinator: no questions goes straight to reconcile", async () => {
  const discoverer = makeFakeDiscoverer([]);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null });
  const adapter = { collectBatch: async () => ({ action: "confirm", answers: {} }) };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, true);
  assert.equal(result.batchesProcessed, 0);
  assert.equal(result.reconciled, true);
});

test("BatchRefinementCoordinator: tracks performance counters", async () => {
  const q1 = createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "boolean", blocking: true });
  const discoverer = makeFakeDiscoverer([q1]);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null });
  const adapter = makeFakeAdapter([{ q1: "yes" }]);

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.counters.discoveryRounds, 1);
  assert.equal(result.counters.batchCount, 1);
  assert.equal(result.counters.questionCount, 1);
  assert.equal(result.counters.reconciliationCalls, 1);
});

test("BatchRefinementCoordinator: --auto mode skips adapter", async () => {
  const q1 = createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "boolean", blocking: true, decisionRequired: "CONTEXT_CONFIRMABLE" });
  const discoverer = makeFakeDiscoverer([q1]);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: ["Req"], addConstraints: [], detectedUnknowns: [], question: null });
  let adapterCalled = false;
  const adapter = { collectBatch: async () => { adapterCalled = true; return { action: "confirm", answers: {} }; } };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, [], { auto: true });

  assert.equal(result.success, true);
  assert.equal(adapterCalled, false);
  assert.equal(result.autoApproved, true);
});

test("BatchRefinementCoordinator: --auto is blocked by HUMAN_REQUIRED question", async () => {
  const q1 = createBatchQuestion({ id: "q1", dimension: "auth", text: "Tipo de auth?", answerType: "single-choice", options: [{ value: "public", label: "Publica" }], blocking: true, decisionRequired: "HUMAN_REQUIRED" });
  const discoverer = makeFakeDiscoverer([q1]);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null });
  let adapterCalled = false;
  const adapter = { collectBatch: async () => { adapterCalled = true; return { action: "confirm", answers: {} }; } };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, [], { auto: true });

  assert.equal(result.success, false);
  assert.equal(result.blocked, true);
  assert.equal(adapterCalled, false);
  assert.equal(result.autoBlocked.type, "HUMAN_INPUT_REQUIRED");
  assert.deepEqual(result.autoBlocked.dimensions, ["auth"]);
});

test("BatchRefinementCoordinator: --auto with autoPolicy authorizing HUMAN_REQUIRED proceeds", async () => {
  const q1 = createBatchQuestion({ id: "q1", dimension: "auth", text: "Tipo de auth?", answerType: "single-choice", options: [{ value: "public", label: "Publica", recommended: true }, { value: "oauth", label: "OAuth" }], blocking: true, decisionRequired: "HUMAN_REQUIRED" });
  const discoverer = makeFakeDiscoverer([q1]);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: ["Req"], addConstraints: [], detectedUnknowns: [], question: null });
  const adapter = { collectBatch: async () => ({ action: "confirm", answers: {} }) };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, [], { auto: true, autoPolicy: { decisionClasses: ["CONTEXT_CONFIRMABLE", "HUMAN_REQUIRED"] } });

  assert.equal(result.success, true);
  assert.equal(result.autoBlocked, null);
  assert.equal(result.batchesProcessed, 1);
});

test("BatchRefinementCoordinator: adapter confirming without answers cannot spin the local loop", async () => {
  const q1 = createBatchQuestion({ id: "q1", dimension: "scope", text: "x", answerType: "boolean", blocking: true });
  const discoverer = makeFakeDiscoverer([q1]);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: ["Req"], addConstraints: [], detectedUnknowns: [], question: null });
  let adapterCalls = 0;
  const adapter = { collectBatch: async () => { adapterCalls++; return { action: "confirm", answers: {} }; } };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, true);
  assert.equal(adapterCalls, 1, "no-progress guard must stop a second identical batch");
  assert.equal(result.batchesProcessed, 1);
});
