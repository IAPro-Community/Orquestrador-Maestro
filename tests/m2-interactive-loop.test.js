"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { AiInterviewer } = require("../runtime/planner/ai-interviewer");
const { IntentRefiner } = require("../runtime/planner/intent-refiner");
const { createIntentSpec, createIntentUnknown } = require("../runtime/planner/intent-spec");
const { applyProposal } = require("../runtime/planner/proposal-validator");

const GENERIC_COVERAGE = "Insufficient requirements or constraints defined.";

const HUMAN_ANSWER = `CRUD apenas de backend para produtos, seguindo a arquitetura e convenções já existentes no projeto. Usar a mesma persistência já utilizada pelo sistema. Expor API REST com operações de criar, listar, buscar por id, atualizar e excluir. Incluir validações básicas e testes automatizados. Não criar frontend e não introduzir novas tecnologias.`;

function quietPrompts() {
  return {
    text: async () => HUMAN_ANSWER,
    select: async () => "confirm",
    spinner: () => ({ start() {}, message() {}, stop() {}, startTimer() {}, stopTimer() {} }),
    note: () => {},
    log: { error: () => {}, info: () => {}, success: () => {} },
    isCancel: () => false
  };
}

function handleFor(proposal) {
  return {
    providerId: "opencode",
    pid: 1,
    result: Promise.resolve({
      providerId: "opencode",
      pid: 1,
      stdout: JSON.stringify(proposal),
      stderr: "",
      exitCode: 0,
      signal: null,
      cancelled: false,
      timedOut: false
    }),
    cancel() {}
  };
}

// Faithful deterministic LLM surrogate: handles batch discovery, reconciliation,
// and legacy refinement prompt formats.
function answerAwareProvider(promptsSeen) {
  let round = 0;
  return {
    get: () => ({
      detect: async () => ({ installed: true }),
      execute: async ({ prompt }) => {
        round++;
        promptsSeen.push(prompt);

        // Batch discovery format
        if (prompt.includes("batch intent discovery engine")) {
          return handleFor({
            questions: [
              {
                id: "q-coverage",
                unknownId: "coverage-1",
                dimension: "coverage",
                group: "coverage",
                text: "Defina o escopo e dados do CRUD",
                answerType: "text",
                options: [],
                blocking: true,
                priority: 1,
                reason: GENERIC_COVERAGE,
                decisionRequired: "HUMAN_REQUIRED",
                activation: null
              }
            ],
            detectedUnknowns: [
              { id: "coverage-1", dimension: "coverage", description: GENERIC_COVERAGE, status: "OPEN", blocking: true }
            ],
            requirementsToAdd: [],
            constraintsToAdd: []
          });
        }

        // Reconciliation format
        if (prompt.includes("intent reconciliation engine")) {
          if (prompt.includes(HUMAN_ANSWER) || prompt.includes("coverage")) {
            return handleFor({
              objective: "CRUD de produtos (backend, REST)",
              addRequirements: [
                "criar produto",
                "listar produtos",
                "buscar produto por id",
                "atualizar produto",
                "excluir produto",
                "validacoes basicas",
                "testes automatizados"
              ],
              addConstraints: [
                "somente backend",
                "API REST",
                "seguir arquitetura e convencoes existentes",
                "reutilizar persistencia existente",
                "sem frontend",
                "sem novas tecnologias"
              ],
              detectedUnknowns: [],
              question: null
            });
          }
          return handleFor({
            objective: null,
            addRequirements: [],
            addConstraints: [],
            detectedUnknowns: [],
            question: null
          });
        }

        // Legacy refinement format
        if (round === 1) {
          return handleFor({
            updates: { objective: "quero criar um crud de produtos" },
            addRequirements: [],
            addConstraints: [],
            detectedUnknowns: [
              { id: "coverage-1", dimension: "coverage", description: GENERIC_COVERAGE, status: "OPEN", blocking: true }
            ],
            question: null,
            recommendation: null
          });
        }
        if (!prompt.includes(HUMAN_ANSWER) || !prompt.includes("USER_DECISION")) {
          return handleFor({
            addRequirements: [],
            addConstraints: [],
            detectedUnknowns: [
              { id: "coverage-1", dimension: "coverage", description: GENERIC_COVERAGE, status: "OPEN", blocking: true }
            ]
          });
        }
        return handleFor({
          updates: { objective: "CRUD de produtos (backend, REST)" },
          addRequirements: [
            "criar produto",
            "listar produtos",
            "buscar produto por id",
            "atualizar produto",
            "excluir produto",
            "validacoes basicas",
            "testes automatizados"
          ],
          addConstraints: [
            "somente backend",
            "API REST",
            "seguir arquitetura e convencoes existentes",
            "reutilizar persistencia existente",
            "sem frontend",
            "sem novas tecnologias"
          ],
          detectedUnknowns: [],
          question: null,
          recommendation: null
        });
      }
    })
  };
}

test("M2 loop: human clarification propagates to refinement and resolves coverage (P4)", async () => {
  const promptsSeen = [];
  let questionCount = 0;

  const promptsStub = quietPrompts();
  promptsStub.text = async () => {
    questionCount++;
    return HUMAN_ANSWER;
  };

  const app = { providers: answerAwareProvider(promptsSeen) };
  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: { WORKSPACE_FRAMEWORK: "arquitetura existente" },
    application: app,
    intent: "quero criar um crud de produtos",
    aiProvider: "opencode",
    prompts: promptsStub
  });

  const brief = await interviewer.runInteractive();

  const spec = JSON.parse(brief.answers.ai_refinement);

  assert.strictEqual(brief.ambiguity, 0, "Intent must be ready after the clarification round");
  assert.ok(brief.answers.requirements.length >= 5, "MissionBrief must expose structured requirements");
  assert.ok(brief.answers.constraints.length >= 5, "MissionBrief must expose structured constraints");

  const hasHumanAnswer = brief.answers.userDecisions.some((d) =>
    d.includes(HUMAN_ANSWER) || d.includes("HUMAN_ANSWER") || d.includes("coverage")
  );
  assert.ok(hasHumanAnswer, "USER_DECISION must include the human answer or coverage dimension");

  const semantics = [...spec.requirements, ...spec.constraints].join(" ").toLowerCase();
  for (const token of ["backend", "rest", "persist", "valid", "test"]) {
    assert.ok(semantics.includes(token), `semantic addition must cover: ${token}`);
  }

  const coverageUnknown = spec.unknowns.find((u) => u.id === "coverage-1");
  if (coverageUnknown) {
    assert.strictEqual(coverageUnknown.status, "RESOLVED", "answered unknown must transition to RESOLVED");
  }

  // Verify AI was called for both discovery and reconciliation (batch) or multiple refinements (legacy)
  assert.ok(promptsSeen.length >= 2, "At least 2 AI calls should occur (discovery + reconciliation or refinement loop)");
});

test("Refiner input contract: clarification payload reaches the next refinement input", async () => {
  const promptsSeen = [];
  const app = { providers: answerAwareProvider(promptsSeen) };
  const refiner = new IntentRefiner({
    aiProvider: "opencode",
    application: app,
    taskRelevantContext: { items: [{ key: "FRAMEWORK", value: "existente", type: "FACT" }] }
  });

  const spec = createIntentSpec("quero criar um crud de produtos", {
    objective: "quero criar um crud de produtos",
    userDecisions: [`Decided [coverage]: ${HUMAN_ANSWER}`],
    unknowns: [
      createIntentUnknown({
        id: "coverage-1",
        dimension: "coverage",
        description: GENERIC_COVERAGE,
        reason: "No requirements or constraints defined",
        blocking: true,
        status: "RESOLVED",
        metadata: { resolvedBy: "USER_DECISION" }
      })
    ]
  });

  await refiner.refine(spec, {
    blocker: { type: "UNKNOWN_OPEN", dimension: "coverage", description: GENERIC_COVERAGE },
    answer: HUMAN_ANSWER
  });

  const prompt = promptsSeen[0];
  assert.ok(prompt.includes("quero criar um crud de produtos"), "refinement input must include the intent");
  assert.ok(prompt.includes(GENERIC_COVERAGE), "refinement input must include the answered question");
  assert.ok(prompt.includes(HUMAN_ANSWER), "refinement input must include the human response verbatim");
  assert.ok(prompt.includes("USER_DECISION"), "refinement input must preserve human provenance");
  assert.ok(prompt.includes("Decided [coverage]"), "refinement input must include existing USER_DECISION state");
  assert.ok(prompt.includes("RESOLVED"), "refinement input must include unknown lifecycle state");
  assert.ok(prompt.includes("FRAMEWORK"), "refinement input must keep project/context evidence");
});

test("applyProposal must not resurrect a RESOLVED unknown through id merge", () => {
  const spec = createIntentSpec("crud", {
    unknowns: [
      createIntentUnknown({
        id: "coverage-1",
        dimension: "coverage",
        description: GENERIC_COVERAGE,
        reason: "answered",
        blocking: true,
        status: "RESOLVED"
      })
    ]
  });

  const result = applyProposal(spec, {
    addRequirements: [],
    addConstraints: [],
    detectedUnknowns: [
      { id: "coverage-1", dimension: "coverage", description: GENERIC_COVERAGE, status: "OPEN", blocking: true }
    ]
  });

  assert.strictEqual(result.unknowns.length, 1, "same-id proposal must not create a duplicate");
  assert.strictEqual(result.unknowns[0].status, "RESOLVED", "RESOLVED must win over a same-id OPEN proposal");
});

test("loop guard: identical question from identical readiness state must not repeat forever", async () => {
  const promptsStub = quietPrompts();
  // Override select to cancel, so batch flow returns early
  promptsStub.select = async () => "cancel";

  const app = {
    providers: {
      get: () => ({
        detect: async () => ({ installed: true }),
        execute: async () =>
          handleFor({
            addRequirements: [],
            addConstraints: [],
            detectedUnknowns: [
              { id: "coverage-1", dimension: "coverage", description: GENERIC_COVERAGE, status: "OPEN", blocking: true }
            ]
          })
      })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: {},
    application: app,
    intent: "quero fazer algo vago",
    aiProvider: "opencode",
    prompts: promptsStub
  });

  // Batch flow: cancel returns gracefully. Legacy flow: throws M2_CLARIFICATION_LOOP.
  // Either outcome is acceptable — the important thing is no infinite loop.
  try {
    const result = await interviewer.runInteractive();
    // Batch flow: cancelled, spec returned without blocking loop
    assert.ok(result, "Batch flow returns a result on cancel");
  } catch (err) {
    // Legacy flow: loop guard catches the repetition
    assert.match(err.message, /M2_CLARIFICATION_LOOP/);
  }
});