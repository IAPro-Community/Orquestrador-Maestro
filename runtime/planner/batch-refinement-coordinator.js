"use strict";

const { scheduleQuestions, evaluateActivation } = require("./question-scheduler.js");
const { BatchAnswerCollector } = require("./batch-answer-collector.js");
const { BatchAnswerApplier } = require("./batch-answer-applier.js");
const { IntentReconciler } = require("./intent-reconciler.js");
const { createBatchQuestion } = require("./batch-question.js");
const { evaluateReadiness } = require("./readiness-evaluator.js");

const DEFAULT_MAX_DISCOVERY_ROUNDS = 3;
const DEFAULT_AUTO_POLICY_CLASSES = ["CONTEXT_CONFIRMABLE"];

class BatchRefinementCoordinator {
  constructor({ discoverer, reconciler, adapter, applier } = {}) {
    this._discoverer = discoverer || null;
    this._reconciler = reconciler || new IntentReconciler();
    this._adapter = adapter || null;
    this._applier = applier || new BatchAnswerApplier();
    this._collector = new BatchAnswerCollector();
  }

  async run(intentSpec, context, skills, options = {}) {
    const auto = options.auto === true;
    const batchSize = options.batchSize || 4;
    const maxDiscoveryRounds = options.maxDiscoveryRounds || DEFAULT_MAX_DISCOVERY_ROUNDS;
    const autoPolicy = options.autoPolicy || null;

    const counters = {
      discoveryRounds: 0,
      batchCount: 0,
      questionCount: 0,
      reconciliationCalls: 0,
      localSchedules: 0
    };

    let allQuestions = [];
    let currentSpec = { ...intentSpec };
    let candidateRequirements = [];
    let candidateConstraints = [];
    const answers = new Map();
    const appliedIds = new Set();
    const allConfirmed = [];
    let batchesProcessed = 0;
    let cancelled = false;
    let needDiscovery = true;
    let autoBlocked = null;
    let exhausted = false;
    const safetyIterations = maxDiscoveryRounds * 3 + 2;
    let iterations = 0;

    while (iterations++ < safetyIterations) {
      // ── Discovery ──────────────────────────────────────────────────────────
      if (needDiscovery) {
        if (counters.discoveryRounds >= maxDiscoveryRounds) {
          exhausted = true;
          break;
        }

        const discovery = await this._discoverer.discover(
          currentSpec.intent || currentSpec.objective,
          currentSpec,
          skills,
          context
        );
        counters.discoveryRounds = discovery.discoveryRound || counters.discoveryRounds + 1;

        if (discovery.error) {
          if (discovery.error instanceof Error) throw discovery.error;
          throw new Error(`Discovery failed: ${discovery.error}`);
        }
        if (!discovery.valid) {
          throw new Error(`Discovery produced invalid question set: ${discovery.validationErrors.join("; ")}`);
        }

        const existingUnknownIds = new Set((currentSpec.unknowns || []).map((u) => u.id));
        const newUnknowns = (discovery.detectedUnknowns || []).filter((u) => !existingUnknownIds.has(u.id));
        if (newUnknowns.length > 0) {
          currentSpec = { ...currentSpec, unknowns: [...(currentSpec.unknowns || []), ...newUnknowns] };
        }

        candidateRequirements = [...candidateRequirements, ...(discovery.requirementsToAdd || [])];
        candidateConstraints = [...candidateConstraints, ...(discovery.constraintsToAdd || [])];

        const existingQuestionIds = new Set(allQuestions.map((q) => q.id));
        for (const q of discovery.questions || []) {
          if (!existingQuestionIds.has(q.id)) {
            allQuestions.push(q);
            existingQuestionIds.add(q.id);
          }
        }

        // Phase 2: blocking unknown without a question → safe text synthesis or explicit failure.
        const questionUnknownIds = new Set(allQuestions.filter((q) => q.unknownId).map((q) => q.unknownId));
        for (const u of newUnknowns) {
          if (u.blocking && !questionUnknownIds.has(u.id)) {
            const synthetic = this._synthesizeQuestionFromUnknown(u);
            if (synthetic) {
              allQuestions.push(synthetic);
            } else {
              throw new Error(
                `BLOCKING_UNKNOWN_NO_QUESTION: Unknown "${u.id}" (${u.dimension}) is blocking but no question was provided and safe synthesis failed. Cannot proceed.`
              );
            }
          }
        }

        needDiscovery = false;
      }

      // ── Local batches (AI calls = 0) ──────────────────────────────────────
      let batchProgress = true;
      while (batchProgress) {
        const activeQuestions = scheduleQuestions(allQuestions, answers, currentSpec, { batchSize });
        if (activeQuestions.length === 0) break;

        counters.questionCount += activeQuestions.length;
        const answersBefore = answers.size;

        if (auto) {
          const authorized = this._autoAuthorizedClasses(autoPolicy);
          const unauthorized = activeQuestions.filter(
            (q) => q.decisionRequired === "HUMAN_REQUIRED" && !authorized.includes("HUMAN_REQUIRED")
          );
          if (unauthorized.length > 0) {
            autoBlocked = {
              type: "HUMAN_INPUT_REQUIRED",
              dimensions: unauthorized.map((q) => q.dimension)
            };
            break;
          }

          for (const q of activeQuestions) {
            if (q.options && q.options.length > 0) {
              const recommended = q.options.find((o) => o.recommended);
              answers.set(q.id, recommended ? recommended.value : q.options[0].value);
            } else {
              answers.set(q.id, "auto");
            }
          }
          batchesProcessed++;
          counters.batchCount = batchesProcessed;
          batchProgress = answers.size > answersBefore;
          continue;
        }

        this._collector.startBatch(activeQuestions);
        const batchResult = await this._adapter.collectBatch(activeQuestions, {
          batchNumber: batchesProcessed + 1,
          totalQuestions: allQuestions.length,
          answeredCount: answers.size
        });

        if (batchResult.action === "cancel") {
          cancelled = true;
          this._collector.cancelBatch();
          break;
        }

        for (const [qId, answer] of Object.entries(batchResult.answers || {})) {
          this._collector.recordAnswer(qId, answer);
        }

        const confirmed = this._collector.confirmBatch();
        for (const [qId, answer] of confirmed) {
          answers.set(qId, answer);
        }
        batchesProcessed++;
        counters.batchCount = batchesProcessed;
        batchProgress = answers.size > answersBefore;
      }

      if (autoBlocked) break;
      if (cancelled) break;

      // ── Apply newly confirmed answers ─────────────────────────────────────
      const newConfirmed = [];
      for (const [qId, answer] of answers) {
        if (appliedIds.has(qId)) continue;
        appliedIds.add(qId);
        const question = allQuestions.find((q) => q.id === qId);
        newConfirmed.push({ questionId: qId, unknownId: question ? question.unknownId : null, answer });
      }
      if (newConfirmed.length > 0) {
        const newAnswersMap = new Map(newConfirmed.map((c) => [c.questionId, c.answer]));
        currentSpec = this._applier.applyConfirmedAnswers(currentSpec, allQuestions, newAnswersMap);
        allConfirmed.push(...newConfirmed);
      }

      // ── Reconciliation ────────────────────────────────────────────────────
      const reconciliation = await this._reconciler.reconcile(currentSpec, allConfirmed, context, {
        candidateRequirements,
        candidateConstraints
      });
      counters.reconciliationCalls = this._reconciler.aiCalls || 0;

      if (reconciliation.success && reconciliation.proposal) {
        currentSpec = this._applyProposal(currentSpec, reconciliation.proposal);
      }

      // ── Adaptive re-discovery check ───────────────────────────────────────
      const blockingUnknowns = (currentSpec.unknowns || []).filter((u) => u.blocking && u.status === "OPEN");
      if (blockingUnknowns.length === 0) break;

      const coverableLocally = blockingUnknowns.some((u) => {
        const q = allQuestions.find((qq) => qq.unknownId === u.id && !answers.has(qq.id));
        return Boolean(q) && evaluateActivation(q.activation, answers);
      });

      if (coverableLocally) {
        counters.localSchedules++;
        needDiscovery = false;
        continue;
      }

      needDiscovery = true;
    }

    if (cancelled) {
      return Object.freeze({
        success: false,
        cancelled: true,
        autoApproved: false,
        reconciled: false,
        blocked: false,
        ready: evaluateReadiness(currentSpec).ready,
        autoBlocked: null,
        blockers: Object.freeze([]),
        batchesProcessed,
        totalQuestions: counters.questionCount,
        intentSpec: Object.freeze(currentSpec),
        counters: Object.freeze(counters)
      });
    }

    if (autoBlocked) {
      return Object.freeze({
        success: false,
        cancelled: false,
        autoApproved: auto,
        reconciled: false,
        blocked: true,
        ready: false,
        autoBlocked: Object.freeze(autoBlocked),
        blockers: Object.freeze([]),
        batchesProcessed,
        totalQuestions: counters.questionCount,
        intentSpec: Object.freeze(currentSpec),
        counters: Object.freeze(counters)
      });
    }

    const readiness = evaluateReadiness(currentSpec);
    const hasOpenBlockers = readiness.blockers.length > 0;

    if ((exhausted || iterations >= safetyIterations) && hasOpenBlockers) {
      return Object.freeze({
        success: false,
        cancelled: false,
        autoApproved: auto,
        reconciled: true,
        blocked: true,
        ready: false,
        autoBlocked: null,
        blockers: Object.freeze(readiness.blockers),
        batchesProcessed,
        totalQuestions: counters.questionCount,
        intentSpec: Object.freeze(currentSpec),
        counters: Object.freeze(counters)
      });
    }

    return Object.freeze({
      success: true,
      cancelled: false,
      autoApproved: auto,
      reconciled: counters.reconciliationCalls > 0,
      blocked: false,
      ready: readiness.ready,
      autoBlocked: null,
      blockers: Object.freeze(readiness.blockers),
      batchesProcessed,
      totalQuestions: counters.questionCount,
      intentSpec: Object.freeze(currentSpec),
      counters: Object.freeze(counters)
    });
  }

  _autoAuthorizedClasses(autoPolicy) {
    if (autoPolicy && Array.isArray(autoPolicy.decisionClasses)) {
      return autoPolicy.decisionClasses;
    }
    return DEFAULT_AUTO_POLICY_CLASSES;
  }

  _synthesizeQuestionFromUnknown(unknown) {
    if (!unknown || !unknown.id || !unknown.dimension) return null;
    try {
      return createBatchQuestion({
        id: `synth-${unknown.id}`,
        unknownId: unknown.id,
        dimension: unknown.dimension,
        group: unknown.dimension,
        text: unknown.description || `Qual decisao deve ser tomada para "${unknown.dimension}"?`,
        answerType: "text",
        decisionRequired: "HUMAN_REQUIRED",
        options: [],
        blocking: true,
        priority: 5,
        reason: unknown.reason || `Blocking unknown: ${unknown.dimension}`
      });
    } catch {
      return null;
    }
  }

  _applyProposal(intentSpec, proposal) {
    const newSpec = { ...intentSpec };

    if (proposal.objective) {
      newSpec.objective = proposal.objective;
    }

    if (Array.isArray(proposal.addRequirements)) {
      const reqSet = new Set([...(intentSpec.requirements || []), ...proposal.addRequirements]);
      newSpec.requirements = [...reqSet];
    }

    if (Array.isArray(proposal.addConstraints)) {
      const conSet = new Set([...(intentSpec.constraints || []), ...proposal.addConstraints]);
      newSpec.constraints = [...conSet];
    }

    if (Array.isArray(proposal.detectedUnknowns) && proposal.detectedUnknowns.length > 0) {
      const existingIds = new Set((intentSpec.unknowns || []).map((u) => u.id));
      const newUnknowns = proposal.detectedUnknowns.filter((u) => !existingIds.has(u.id));
      newSpec.unknowns = [...(intentSpec.unknowns || []), ...newUnknowns];
    }

    newSpec.updatedAt = new Date().toISOString();
    return newSpec;
  }
}

module.exports = { BatchRefinementCoordinator, DEFAULT_MAX_DISCOVERY_ROUNDS, DEFAULT_AUTO_POLICY_CLASSES };