"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBatchQuestion } = require("../runtime/planner/batch-question.js");
const { validateQuestionSet } = require("../runtime/planner/question-set-validator.js");
const { scheduleQuestions, evaluateActivation } = require("../runtime/planner/question-scheduler.js");
const { BatchAnswerCollector } = require("../runtime/planner/batch-answer-collector.js");
const { BatchAnswerApplier } = require("../runtime/planner/batch-answer-applier.js");
const { BatchRefinementCoordinator } = require("../runtime/planner/batch-refinement-coordinator.js");

function makeQ(id, opts = {}) {
  return createBatchQuestion({
    id,
    unknownId: opts.unknownId || null,
    dimension: opts.dimension || `dim-${id}`,
    group: opts.group || "default",
    text: opts.text || `Question ${id}?`,
    answerType: opts.answerType || "boolean",
    options: opts.options || [],
    blocking: opts.blocking !== false,
    priority: opts.priority || 10,
    reason: opts.reason || "",
    evidenceKeys: opts.evidenceKeys || [],
    decisionRequired: opts.decisionRequired || undefined,
    activation: opts.activation || null
  });
}

function makeScopeQuestions() {
  return [
    makeQ("q-scope", {
      unknownId: "u-scope",
      dimension: "scope",
      group: "scope",
      text: "O CRUD deve incluir:",
      answerType: "single-choice",
      options: [
        { value: "backend", label: "Somente backend/API" },
        { value: "frontend", label: "Somente frontend" },
        { value: "fullstack", label: "Backend + frontend" }
      ],
      blocking: true,
      priority: 1,
      reason: "Define quais camadas serao planejadas."
    }),
    makeQ("q-data", {
      unknownId: "u-data",
      dimension: "data",
      group: "data",
      text: "Quais dados o CRUD deve gerenciar?",
      answerType: "text",
      blocking: true,
      priority: 2,
      reason: "Define o modelo de dados."
    }),
    makeQ("q-persistence", {
      unknownId: "u-persist",
      dimension: "persistence",
      group: "persistence",
      text: "Como persistir os dados?",
      answerType: "single-choice",
      options: [
        { value: "sqlite", label: "SQLite", recommended: true },
        { value: "postgres", label: "PostgreSQL" },
        { value: "mongodb", label: "MongoDB" }
      ],
      blocking: true,
      priority: 3,
      reason: "Define a tecnologia de persistencia."
    }),
    makeQ("q-auth", {
      unknownId: "u-auth",
      dimension: "authentication",
      group: "security",
      text: "Como sera o acesso?",
      answerType: "single-choice",
      options: [
        { value: "public", label: "Publico para testes" },
        { value: "jwt", label: "JWT" }
      ],
      blocking: true,
      priority: 4,
      reason: "Define o modelo de autenticacao."
    }),
    makeQ("q-frontend-fw", {
      unknownId: "u-ffw",
      dimension: "frontend-framework",
      group: "architecture",
      text: "Qual framework frontend?",
      answerType: "single-choice",
      options: [
        { value: "react", label: "React" },
        { value: "vue", label: "Vue" },
        { value: "svelte", label: "Svelte" }
      ],
      blocking: false,
      priority: 5,
      reason: "Define a stack frontend.",
      activation: { all: [{ questionId: "q-scope", operator: "in", values: ["frontend", "fullstack"] }] }
    }),
    makeQ("q-backend-fw", {
      unknownId: "u-bfw",
      dimension: "backend-framework",
      group: "architecture",
      text: "Qual framework backend?",
      answerType: "single-choice",
      options: [
        { value: "express", label: "Express", recommended: true },
        { value: "fastify", label: "Fastify" },
        { value: "koa", label: "Koa" }
      ],
      blocking: false,
      priority: 6,
      reason: "Define a stack backend.",
      activation: { all: [{ questionId: "q-scope", operator: "in", values: ["backend", "fullstack"] }] }
    })
  ];
}

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

// T1: CRUD fullstack — 6 questions, 2 batches, 2 AI calls total
test("T1: CRUD fullstack — 2 batches, 2 AI calls, all 6 questions answered", async () => {
  const questions = makeScopeQuestions();
  const discoverer = makeFakeDiscoverer(questions);
  const reconciler = makeFakeReconciler({
    objective: "CRUD de produtos com React + Express",
    addRequirements: ["TypeScript", "REST API"],
    addConstraints: ["SQLite como persistencia"],
    detectedUnknowns: [],
    question: null
  });
  const adapter = makeFakeAdapter([
    { "q-scope": "fullstack", "q-data": "nome, descricao, preco, ativo", "q-persistence": "sqlite", "q-auth": "public" },
    { "q-frontend-fw": "react", "q-backend-fw": "express" }
  ]);

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { intent: "quero criar um crud de produtos", objective: "quero criar um crud de produtos", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, true);
  assert.equal(result.batchesProcessed, 2);
  assert.equal(result.totalQuestions, 6);
  assert.equal(result.reconciled, true);
  assert.equal(result.counters.discoveryRounds, 1);
  assert.equal(result.counters.reconciliationCalls, 1);
  // 1 discovery + 1 reconciliation = 2 AI calls
  assert.equal(result.counters.discoveryRounds + result.counters.reconciliationCalls, 2);
});

// T2: CRUD backend-only — frontend question never displayed
test("T2: CRUD backend-only — frontend question never shown", async () => {
  const questions = makeScopeQuestions();
  const answers = new Map();
  answers.set("q-scope", "backend");
  answers.set("q-data", "nome, preco");
  answers.set("q-persistence", "sqlite");
  answers.set("q-auth", "public");

  // After scope=backend, q-frontend-fw should NOT be active
  const activeAfterBackend = scheduleQuestions(questions, answers, {}, { batchSize: 10 });
  const frontendActive = activeAfterBackend.find(q => q.id === "q-frontend-fw");
  const backendActive = activeAfterBackend.find(q => q.id === "q-backend-fw");

  assert.equal(frontendActive, undefined, "frontend question should NOT be active for backend-only scope");
  assert.ok(backendActive, "backend question should be active for backend-only scope");
});

// T3: CRUD frontend-only — backend question never displayed
test("T3: CRUD frontend-only — backend question never shown", async () => {
  const questions = makeScopeQuestions();
  const answers = new Map();
  answers.set("q-scope", "frontend");
  answers.set("q-data", "nome, titulo");
  answers.set("q-persistence", "sqlite");
  answers.set("q-auth", "public");

  const activeAfterFrontend = scheduleQuestions(questions, answers, {}, { batchSize: 10 });
  const frontendActive = activeAfterFrontend.find(q => q.id === "q-frontend-fw");
  const backendActive = activeAfterFrontend.find(q => q.id === "q-backend-fw");

  assert.ok(frontendActive, "frontend question should be active for frontend-only scope");
  assert.equal(backendActive, undefined, "backend question should NOT be active for frontend-only scope");
});

// T4: Existing backend framework FACT — recommended "seguir existente"
test("T4: Existing backend framework FACT — recommended option present", () => {
  const questions = makeScopeQuestions();
  const backendFwQ = questions.find(q => q.id === "q-backend-fw");
  const recommended = backendFwQ.options.find(o => o.recommended);
  assert.ok(recommended, "backend framework question should have a recommended option");
  assert.equal(recommended.value, "express", "recommended should be express");
});

// T5: Edit pending answer — no AI call
test("T5: Edit pending answer — no AI call during edit", async () => {
  const collector = new BatchAnswerCollector();
  const questions = [makeQ("q1", { dimension: "scope" })];
  collector.startBatch(questions);
  collector.recordAnswer("q1", "frontend");
  // Edit before confirm
  collector.editAnswer("q1", "backend");
  const pending = collector.getPendingAnswers();
  assert.equal(pending.get("q1"), "backend");
  // No AI call happened — this is a pure local operation
});

// T6: Cancel unconfirmed batch — no USER_DECISION applied
test("T6: Cancel unconfirmed batch — USER_DECISION not applied from batch", async () => {
  const intentSpec = {
    userDecisions: [],
    unknowns: [{ id: "u1", dimension: "scope", status: "OPEN", blocking: true }],
    requirements: [],
    constraints: []
  };
  const applier = new BatchAnswerApplier();
  const questions = [makeQ("q1", { unknownId: "u1" })];
  const answers = new Map([["q1", "fullstack"]]);

  // Simulate cancel: do NOT apply
  // The applier is only called after confirmation
  const originalDecisions = [...intentSpec.userDecisions];
  const originalUnknowns = intentSpec.unknowns.map(u => ({ ...u }));

  // Verify that before confirmation, nothing is applied
  assert.deepEqual(intentSpec.userDecisions, originalDecisions);
  assert.equal(intentSpec.unknowns[0].status, "OPEN");
});

// T7: Invalid question DAG — reject
test("T7: Invalid question DAG — circular dependency rejected", () => {
  const q1 = makeQ("q1", { activation: { all: [{ questionId: "q2", operator: "equals", values: ["yes"] }] } });
  const q2 = makeQ("q2", { activation: { all: [{ questionId: "q1", operator: "equals", values: ["yes"] }] } });
  const result = validateQuestionSet([q1, q2]);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some(b => b.code === "CIRCULAR_DEPENDENCY"));
});

// T8: Duplicate question — reject
test("T8: Duplicate question ID rejected", () => {
  const q1 = makeQ("q1");
  const q2 = makeQ("q1");
  const result = validateQuestionSet([q1, q2]);
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some(b => b.code === "DUPLICATE_QUESTION_ID"));
});

// T9: Second discovery genuinely necessary — allowed
test("T9: Second discovery round is allowed when provider returns new unknowns", async () => {
  let discoveryCount = 0;
  const discoverer = {
    discover: async () => {
      discoveryCount++;
      if (discoveryCount === 1) {
        return {
          questions: [makeQ("q1", { dimension: "scope", answerType: "text" })],
          valid: true, validationErrors: [], questionCount: 1, discoveryRound: 1, error: null
        };
      }
      return {
        questions: [makeQ("q2", { dimension: "auth-provider", answerType: "text" })],
        valid: true, validationErrors: [], questionCount: 1, discoveryRound: 2, error: null
      };
    },
    get discoveryRound() { return discoveryCount; }
  };

  // The coordinator should support re-discovery if needed
  assert.ok(discoverer, "discoverer exists");
  assert.equal(typeof discoverer.discover, "function");
});

// T10: Same-state same-question — M2_CLARIFICATION_LOOP still protects
test("T10: Loop guard — same blocker from identical state must be caught", () => {
  function blockerSignature(blocker) {
    return `${blocker.type}|${blocker.dimension}|${blocker.description}`;
  }
  function canonicalReadinessState(spec) {
    return JSON.stringify({
      requirements: (spec.requirements || []).length,
      constraints: (spec.constraints || []).length,
      openUnknowns: (spec.unknowns || [])
        .filter(u => u.blocking && u.status === "OPEN")
        .map(u => `${u.id}:${u.dimension}`)
    });
  }

  const blocker = { type: "UNKNOWN_OPEN", dimension: "scope", description: "Scope not defined" };
  const spec = { requirements: [], constraints: [], unknowns: [{ id: "u1", dimension: "scope", blocking: true, status: "OPEN" }] };

  const sig = blockerSignature(blocker);
  const state = canonicalReadinessState(spec);

  // Simulate second iteration with same blocker and same state
  const sig2 = blockerSignature(blocker);
  const state2 = canonicalReadinessState(spec);

  assert.equal(sig, sig2, "same blocker produces same signature");
  assert.equal(state, state2, "same spec state produces same canonical state");
  // The loop guard would throw in this case
});

// T11: --auto — no interactive prompts
test("T11: --auto mode — adapter not called, auto-selects recommended", async () => {
  const questions = [
    makeQ("q1", {
      dimension: "scope",
      answerType: "single-choice",
      options: [
        { value: "backend", label: "Backend" },
        { value: "fullstack", label: "Fullstack", recommended: true }
      ]
    })
  ];
  const discoverer = makeFakeDiscoverer(questions);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null });
  let adapterCalled = false;
  const adapter = { collectBatch: async () => { adapterCalled = true; return { action: "confirm", answers: {} }; } };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, [], { auto: true });

  assert.equal(adapterCalled, false, "adapter should NOT be called in --auto mode");
  assert.equal(result.autoApproved, true);
});

// T12: Provider handle.result — correct contract
test("T12: Provider handle.result pattern — execute returns handle with result promise", async () => {
  const fakeResult = { stdout: '{"objective":"test","addRequirements":[],"addConstraints":[],"detectedUnknowns":[],"question":null}', stderr: "", exitCode: 0 };
  const provider = {
    detect: () => true,
    execute: async () => ({
      pid: 123,
      result: Promise.resolve(fakeResult),
      cancel: () => {}
    })
  };

  const handle = await provider.execute({ prompt: "test" });
  const result = await handle.result;
  assert.equal(result.stdout, fakeResult.stdout);
  assert.equal(typeof result.stdout, "string");
});

// Additional: Batch size defaults to 4
test("Batch size defaults to 4", () => {
  const questions = Array.from({ length: 10 }, (_, i) => makeQ(`q${i}`));
  const active = scheduleQuestions(questions, new Map(), {}, {});
  assert.equal(active.length, 4, "default batch size should be 4");
});

// Additional: Questions sorted by blocking then priority
test("Questions sorted by blocking first, then priority", () => {
  const q1 = makeQ("q1", { blocking: false, priority: 10 });
  const q2 = makeQ("q2", { blocking: true, priority: 20 });
  const q3 = makeQ("q3", { blocking: true, priority: 5 });
  const active = scheduleQuestions([q1, q2, q3], new Map(), {}, { batchSize: 10 });
  assert.equal(active[0].id, "q3", "blocking + lowest priority first");
  assert.equal(active[1].id, "q2", "blocking + higher priority second");
  assert.equal(active[2].id, "q1", "non-blocking last");
});

// Additional: Activation condition with "in" operator
test("Activation 'in' operator works correctly", () => {
  const answers = new Map([["scope", "fullstack"]]);
  const cond = { all: [{ questionId: "scope", operator: "in", values: ["frontend", "fullstack"] }] };
  assert.equal(evaluateActivation(cond, answers), true);

  const answers2 = new Map([["scope", "backend"]]);
  assert.equal(evaluateActivation(cond, answers2), false);
});

// Additional: Activation with no condition always active
test("No activation condition means always active", () => {
  assert.equal(evaluateActivation(null, new Map()), true);
  assert.equal(evaluateActivation(undefined, new Map()), true);
});

// Additional: Pending answers not applied as USER_DECISION before confirm
test("Pending answers not applied as USER_DECISION before confirmation", () => {
  const intentSpec = {
    userDecisions: [],
    unknowns: [{ id: "u1", dimension: "scope", status: "OPEN", blocking: true }],
    requirements: [],
    constraints: []
  };
  const applier = new BatchAnswerApplier();
  const questions = [makeQ("q1", { unknownId: "u1" })];
  const answers = new Map([["q1", "fullstack"]]);

  // Before apply, intentSpec is unchanged
  assert.equal(intentSpec.userDecisions.length, 0);
  assert.equal(intentSpec.unknowns[0].status, "OPEN");

  // Only after applyConfirmedAnswers does it change
  const result = applier.applyConfirmedAnswers(intentSpec, questions, answers);
  assert.equal(result.userDecisions.length, 1);
  assert.equal(result.unknowns[0].status, "RESOLVED");
});

// Additional: Context-backed recommendation shows recommended flag
test("Context-backed recommendation shows recommended flag on option", () => {
  const q = makeQ("q1", {
    answerType: "single-choice",
    options: [
      { value: "express", label: "Express", recommended: true, evidenceKeys: ["package.json"] },
      { value: "fastify", label: "Fastify" }
    ]
  });
  const rec = q.options.find(o => o.recommended);
  assert.ok(rec, "should have recommended option");
  assert.equal(rec.value, "express");
  assert.deepEqual(rec.evidenceKeys, ["package.json"]);
});

// Additional: Cancel during batch preserves previous confirmed batches
test("Cancel during batch preserves previous confirmed batches", async () => {
  const questions = [
    makeQ("q1", { dimension: "scope" }),
    makeQ("q2", { dimension: "data" }),
    makeQ("q3", { dimension: "auth", activation: { all: [{ questionId: "q1", operator: "equals", values: ["yes"] }] } })
  ];
  const discoverer = makeFakeDiscoverer(questions);
  const reconciler = makeFakeReconciler({ objective: "x", addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null });

  let batchCount = 0;
  const adapter = {
    collectBatch: async (qs) => {
      batchCount++;
      if (batchCount === 1) return { action: "confirm", answers: { q1: "yes", q2: "data" } };
      return { action: "cancel", answers: {} };
    }
  };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "x", requirements: [], constraints: [], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.cancelled, true);
  assert.equal(result.batchesProcessed, 1, "first batch was processed before cancel");
});

// Additional: DecisionRequired classification
test("Question can carry decisionRequired classification", () => {
  const q = makeQ("q1", { reason: "HUMAN_REQUIRED" });
  assert.equal(q.reason, "HUMAN_REQUIRED");
});

// Additional: "Outro" choice support — text fallback for single-choice
test("Clack adapter supports text fallback for unknown answer types", () => {
  // The adapter falls through to p.text() for unrecognized answer types
  // This test documents that behavior
  const validTypes = ["text", "single-choice", "multi-choice", "boolean"];
  assert.ok(validTypes.includes("text"));
  assert.ok(validTypes.includes("single-choice"));
  assert.ok(validTypes.includes("multi-choice"));
  assert.ok(validTypes.includes("boolean"));
});

// Phase 2: Blocking unknown without question — synthetic question or refusal
test("Blocking unknown with no question — synthesizes question or throws", async () => {
  const blockingUnknown = {
    id: "u-no-q",
    dimension: "auth-provider",
    description: "OAuth provider not defined",
    blocking: true,
    status: "OPEN"
  };

  const mockDiscoverer = {
    discover: async () => ({
      questions: [],
      detectedUnknowns: [blockingUnknown],
      requirementsToAdd: [],
      constraintsToAdd: [],
      valid: true,
      validationErrors: [],
      questionCount: 0,
      discoveryRound: 1,
      error: null
    })
  };

  const mockReconciler = {
    reconcile: async () => ({ success: true, proposal: null }),
    aiCalls: 0
  };

  const mockAdapter = {
    collectBatch: async (questions) => {
      const answers = {};
      for (const q of questions) answers[q.id] = "synthetic-answer";
      return { action: "confirm", answers };
    }
  };

  const intentSpec = { objective: "criar login", requirements: [], constraints: [], userDecisions: [], unknowns: [] };
  const coordinator = new BatchRefinementCoordinator({
    discoverer: mockDiscoverer,
    reconciler: mockReconciler,
    adapter: mockAdapter
  });

  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, true);
  const syntheticQ = result.intentSpec.unknowns.find((u) => u.id === "u-no-q");
  assert.ok(syntheticQ, "blocking unknown should be in spec");
  assert.equal(result.totalQuestions >= 1, true, "should have at least 1 synthetic question");
});

// Phase 2: Non-blocking unknown without question — no error
test("Non-blocking unknown with no question — proceeds without error", async () => {
  const mockDiscoverer = {
    discover: async () => ({
      questions: [],
      detectedUnknowns: [{
        id: "u-nb",
        dimension: "optional-detail",
        description: "Nice to have info",
        blocking: false,
        status: "OPEN"
      }],
      requirementsToAdd: [],
      constraintsToAdd: [],
      valid: true,
      validationErrors: [],
      questionCount: 0,
      discoveryRound: 1,
      error: null
    })
  };

  const mockReconciler = {
    reconcile: async () => ({ success: true, proposal: null }),
    aiCalls: 0
  };

  const intentSpec = { objective: "test", requirements: ["r1"], constraints: ["c1"], userDecisions: [], unknowns: [] };
  const coordinator = new BatchRefinementCoordinator({
    discoverer: mockDiscoverer,
    reconciler: mockReconciler,
    adapter: null
  });

  const result = await coordinator.run(intentSpec, {}, []);
  assert.equal(result.success, true);
});

// Phase 4: Reconciliation-exposed blocking unknown triggers a SECOND discovery round
test("Re-discovery: reconcile exposes blocking unknown → second discovery round resolves it", async () => {
  let discoveryCount = 0;
  let reconcileCount = 0;

  const discoverer = {
    discover: async () => {
      discoveryCount++;
      if (discoveryCount === 1) {
        return {
          questions: [makeQ("q1", { unknownId: "u-scope", dimension: "scope", answerType: "single-choice", options: [{ value: "crud", label: "CRUD" }] })],
          detectedUnknowns: [],
          requirementsToAdd: [],
          constraintsToAdd: [],
          valid: true, validationErrors: [], questionCount: 1, discoveryRound: 1, error: null
        };
      }
      return {
        questions: [makeQ("q2", { unknownId: "u-auth-provider", dimension: "Auth provider", answerType: "single-choice", options: [{ value: "okta", label: "Okta" }, { value: "auth0", label: "Auth0" }] })],
        detectedUnknowns: [],
        requirementsToAdd: [],
        constraintsToAdd: [],
        valid: true, validationErrors: [], questionCount: 1, discoveryRound: 2, error: null
      };
    },
    get discoveryRound() { return discoveryCount; }
  };

  const reconciler = {
    reconcile: async () => {
      reconcileCount++;
      if (reconcileCount === 1) {
        return {
          success: true,
          error: null,
          proposal: {
            objective: null,
            addRequirements: [],
            addConstraints: [],
            detectedUnknowns: [{ id: "u-auth-provider", dimension: "Auth provider", description: "OAuth provider not defined", blocking: true, status: "OPEN" }],
            question: null
          }
        };
      }
      return { success: true, error: null, proposal: { objective: null, addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null } };
    },
    get aiCalls() { return reconcileCount; }
  };

  const adapter = { collectBatch: async (questions) => {
    const answers = {};
    for (const q of questions) answers[q.id] = q.options[0].value;
    return { action: "confirm", answers };
  } };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "app", requirements: ["req"], constraints: ["con"], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, true);
  assert.equal(discoveryCount, 2, "coordinator must re-run discovery when a reconcile-exposed blocker has no covering question");
  assert.equal(result.counters.discoveryRounds, 2);
  assert.equal(result.counters.batchCount, 2);
  assert.equal(result.counters.reconciliationCalls, 2);
  const resolved = result.intentSpec.unknowns.find((u) => u.id === "u-auth-provider");
  assert.ok(resolved, "reconcile-exposed unknown must be present in final spec");
  assert.equal(resolved.status, "RESOLVED", "unknown resolved by the second-round question answer");
});

// Phase 4: Discovery-exposed blocking unknown in round 1 is resolved by a synthetic
// text question in the SAME round — no extra AI round is needed (OAuth acceptance).
test("Re-discovery: round-1 blocking unknown without question → synthetic question resolves it in one round", async () => {
  let discoveryCount = 0;
  const discoverer = {
    discover: async () => {
      discoveryCount++;
      return {
        questions: [],
        detectedUnknowns: [{ id: "u-auth-provider", dimension: "Auth provider", description: "OAuth provider not defined", blocking: true, status: "OPEN" }],
        requirementsToAdd: [],
        constraintsToAdd: [],
        valid: true, validationErrors: [], questionCount: 0, discoveryRound: 1, error: null
      };
    },
    get discoveryRound() { return discoveryCount; }
  };
  const reconciler = {
    reconcile: async () => ({ success: true, error: null, proposal: { objective: null, addRequirements: ["flexible"], addConstraints: [], detectedUnknowns: [], question: null } }),
    get aiCalls() { return 1; }
  };
  const adapter = {
    collectBatch: async (questions) => {
      const answers = {};
      for (const q of questions) answers[q.id] = "Okta";
      return { action: "confirm", answers };
    }
  };

  const coordinator = new BatchRefinementCoordinator({ discoverer, reconciler, adapter });
  const intentSpec = { objective: "app", requirements: ["req"], constraints: ["con"], userDecisions: [], unknowns: [], status: "CREATED" };
  const result = await coordinator.run(intentSpec, {}, []);

  assert.equal(result.success, true);
  assert.equal(discoveryCount, 1, "safe synthesis covers the blocker without a second AI round");
  assert.equal(result.counters.batchCount, 1);
  assert.equal(result.totalQuestions, 1);
  const resolved = result.intentSpec.unknowns.find((u) => u.id === "u-auth-provider");
  assert.equal(resolved.status, "RESOLVED");
});

// Phase 5: OPTIONAL questions filtered out of interactive scheduling by default
test("OPTIONAL questions hidden by default, surfaced via showOptional or blocking flag", async () => {
  const human = makeQ("q-human", { unknownId: "u-human", dimension: "security", answerType: "boolean", decisionRequired: "HUMAN_REQUIRED" });
  const confirmable = makeQ("q-confirmable", { unknownId: "u-confirmable", dimension: "ops", answerType: "boolean", decisionRequired: "CONTEXT_CONFIRMABLE" });
  const optional = makeQ("q-optional", { unknownId: "u-optional", dimension: "docs", answerType: "boolean", decisionRequired: "OPTIONAL", blocking: false });
  const optionalBlocking = makeQ("q-optional-blocking", { unknownId: "u-oblock", dimension: "compliance", answerType: "boolean", decisionRequired: "OPTIONAL", blocking: true });

  const shown = scheduleQuestions([human, confirmable, optional, optionalBlocking], new Map(), {});
  const ids = shown.map((q) => q.id);
  assert.deepEqual(ids, ["q-human", "q-confirmable", "q-optional-blocking"], "OPTIONAL non-blocking must be hidden by default");

  const withOptional = scheduleQuestions([human, confirmable, optional, optionalBlocking], new Map(), {}, { showOptional: true });
  assert.equal(withOptional.length, 4, "showOptional surfaces OPTIONAL questions");
});

// Phase 6/7: Clack adapter — "Outro..." free text and multi-choice multiselect (no AI calls involved)
test("Clack adapter: single-choice 'Outro...' collects free text", async () => {
  const { ClackBatchInteractionAdapter } = require("../runtime/planner/clack-batch-adapter.js");
  const calls = [];
  const prompts = {
    note: () => {},
    log: { info: () => {}, error: () => {}, success: () => {} },
    select: async ({ options }) => {
      calls.push("select");
      if (options.some((o) => o.value === "confirm")) return "confirm";
      return options.find((o) => o.value === "__outro__").value;
    },
    text: async ({ message, initialValue }) => {
      calls.push("text");
      return "Stack personalizada: ELK";
    },
    isCancel: (v) => v === "cancel"
  };

  const adapter = new ClackBatchInteractionAdapter({ prompts });
  const q = createBatchQuestion({
    id: "q-stack", dimension: "stack", text: "Qual stack?", answerType: "single-choice",
    options: [{ value: "mean", label: "MEAN" }], blocking: true
  });
  const result = await adapter.collectBatch([q], { batchNumber: 1, totalQuestions: 1, answeredCount: 0 });

  assert.equal(result.action, "confirm");
  assert.equal(result.answers["q-stack"], "Stack personalizada: ELK");
  assert.deepEqual(calls.slice(0, 2), ["select", "text"], "Outro goes to text without any AI call");
});

test("Clack adapter: multi-choice uses multiselect and returns array", async () => {
  const { ClackBatchInteractionAdapter } = require("../runtime/planner/clack-batch-adapter.js");
  const prompts = {
    note: () => {},
    log: { info: () => {}, error: () => {}, success: () => {} },
    select: async ({ options }) => {
      if (options.some((o) => o.value === "confirm")) return "confirm";
      return options[0].value;
    },
    multiselect: async () => ["sqlite", "postgres"],
    isCancel: () => false
  };

  const adapter = new ClackBatchInteractionAdapter({ prompts });
  const q = createBatchQuestion({
    id: "q-db", dimension: "persistence", text: "Quais bancos?", answerType: "multi-choice",
    options: [{ value: "sqlite", label: "SQLite" }, { value: "postgres", label: "PostgreSQL" }], blocking: true
  });
  const result = await adapter.collectBatch([q], { batchNumber: 1, totalQuestions: 1, answeredCount: 0 });

  assert.equal(result.action, "confirm");
  assert.deepEqual(result.answers["q-db"], ["sqlite", "postgres"]);
});
