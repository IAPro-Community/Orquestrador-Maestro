"use strict";

const { classifyResolutionFailure, shouldEscalateContext } = require("./escalation/classifier");

const STRATEGIES = Object.freeze(["targeted", "balanced", "deep"]);

function normalizeProgressivePlanningExperiment(experiment = {}) {
  if (!experiment || experiment.authorized !== true) throw new TypeError("progressive planning requires explicit authorized=true");
  const pairId = String(experiment.pairId || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(pairId)) {
    throw new TypeError("progressive planning pairId must be an opaque non-sensitive identifier");
  }
  const startStrategy = String(experiment.startStrategy || "targeted");
  if (!STRATEGIES.includes(startStrategy)) throw new TypeError("startStrategy must be targeted, balanced, or deep");
  return Object.freeze({ version: 1, authorized: true, pairId, startStrategy });
}

function strategySequence(startStrategy) {
  const index = STRATEGIES.indexOf(startStrategy);
  if (index < 0) throw new TypeError("unknown progressive planning strategy");
  return STRATEGIES.slice(index);
}

function isContextEscalationFailure(error) {
  return shouldEscalateContext(classifyResolutionFailure(error));
}

function aggregatePlanningTelemetry(attempts, { fallbackUsed = false, terminalReason = null } = {}) {
  const planning = attempts.map((attempt) => attempt.planningTelemetry).filter(Boolean);
  const providerCalls = planning.reduce((sum, telemetry) => sum + (telemetry.modelCalls || 0), 0);
  const estimatedPromptTokens = planning.reduce((sum, telemetry) => sum + (telemetry.estimatedPromptTokens || 0), 0);
  const providerTokenValues = planning.map((telemetry) => telemetry.providerTokens);
  const providerTokens = planning.length > 0 && providerTokenValues.every(Number.isFinite)
    ? providerTokenValues.reduce((sum, value) => sum + value, 0)
    : null;
  const durations = planning.map((telemetry) => telemetry.durationMs);
  const durationMs = planning.length > 0 && durations.every(Number.isFinite)
    ? durations.reduce((sum, value) => sum + value, 0)
    : null;
  return Object.freeze({
    version: 1,
    modelCalls: providerCalls,
    estimatedPromptTokens,
    providerTokens,
    tokenCompleteness: providerTokens !== null ? "complete" : planning.some((telemetry) => telemetry.tokenCompleteness === "partial" || telemetry.tokenCompleteness === "complete") ? "partial" : "unavailable",
    durationMs,
    fallbackUsed: fallbackUsed === true,
    terminalReason
  });
}

function buildProgressiveSummary(contract, attempts, { fallbackUsed = false, terminalReason = null, successStrategy = null } = {}) {
  const providerAttempts = attempts.filter((attempt) => attempt.outcome !== "duplicate-context-skipped");
  return Object.freeze({
    version: 1,
    pairId: contract.pairId,
    startStrategy: contract.startStrategy,
    successStrategy,
    fallbackUsed: fallbackUsed === true,
    terminalReason,
    contextEscalations: Math.max(0, providerAttempts.length - 1),
    duplicateContextsSkipped: attempts.filter((attempt) => attempt.outcome === "duplicate-context-skipped").length,
    planningTelemetry: aggregatePlanningTelemetry(providerAttempts, { fallbackUsed, terminalReason }),
    attempts: Object.freeze(attempts.map((attempt) => Object.freeze({ ...attempt })))
  });
}

async function planProgressively({
  contextEngine,
  planner,
  intent,
  maxTokens = 8000,
  missionBrief,
  missionId,
  resolvedSkills = [],
  experiment,
  allowFallback = true,
  workspacePath,
  providerOptions = {}
} = {}) {
  if (!contextEngine || typeof contextEngine.buildContext !== "function" || typeof contextEngine.getLastBuildMetrics !== "function") {
    throw new TypeError("contextEngine with buildContext/getLastBuildMetrics is required");
  }
  if (!planner || typeof planner.plan !== "function") throw new TypeError("planner with plan() is required");
  const contract = normalizeProgressivePlanningExperiment(experiment);
  const sequence = strategySequence(contract.startStrategy);
  const seenContexts = new Set();
  const attempts = [];
  let latestContext = null;
  let lastError = null;
  let terminalReason = "strategies-exhausted";

  for (const strategy of sequence) {
    const context = await contextEngine.buildContext(intent, maxTokens, {
      adaptiveResolutionMode: "experiment",
      adaptiveResolutionExperiment: {
        authorized: true,
        arm: "treatment",
        strategy,
        pairId: `${contract.pairId}:${strategy}`
      }
    });
    const contextMetrics = contextEngine.getLastBuildMetrics() || {};
    latestContext = context;
    const digest = contextMetrics.contextDigest || `${contextMetrics.briefMaxChars || "unknown"}:${contextMetrics.estimatedTokens || "unknown"}`;

    if (seenContexts.has(digest)) {
      attempts.push(Object.freeze({
        strategy,
        effectiveBriefMaxChars: contextMetrics.briefMaxChars ?? null,
        contextEstimatedTokens: contextMetrics.estimatedTokens ?? null,
        contextDigest: digest,
        outcome: "duplicate-context-skipped",
        failureKind: null,
        blockerCodes: Object.freeze([]),
        planningTelemetry: null
      }));
      continue;
    }
    seenContexts.add(digest);

    try {
      const result = await planner.plan({
        missionBrief,
        taskRelevantContext: context,
        resolvedSkills,
        missionId,
        allowFallback: false,
        maxAttempts: 1,
        workspacePath: workspacePath || contextEngine.workspacePath,
        providerOptions
      });
      attempts.push(Object.freeze({
        strategy,
        effectiveBriefMaxChars: contextMetrics.briefMaxChars ?? null,
        contextEstimatedTokens: contextMetrics.estimatedTokens ?? null,
        contextDigest: digest,
        contextApplied: contextMetrics.experiment?.applied === true,
        outcome: "validated",
        failureKind: null,
        blockerCodes: Object.freeze([]),
        planningTelemetry: result.planningTelemetry || null
      }));
      const progressivePlanning = buildProgressiveSummary(contract, attempts, {
        fallbackUsed: false,
        terminalReason: "validated",
        successStrategy: strategy
      });
      return { ...result, planningTelemetry: progressivePlanning.planningTelemetry, progressivePlanning };
    } catch (error) {
      lastError = error;
      attempts.push(Object.freeze({
        strategy,
        effectiveBriefMaxChars: contextMetrics.briefMaxChars ?? null,
        contextEstimatedTokens: contextMetrics.estimatedTokens ?? null,
        contextDigest: digest,
        contextApplied: contextMetrics.experiment?.applied === true,
        outcome: "failed",
        failureKind: error?.failureKind || "unknown",
        blockerCodes: Object.freeze([...(error?.blockerCodes || [])]),
        planningTelemetry: error?.planningTelemetry || null
      }));

      const classifiedReason = classifyResolutionFailure(error);
      if (shouldEscalateContext(classifiedReason)) {
        terminalReason = classifiedReason;
        continue;
      }
      terminalReason = classifiedReason;
      break;
    }
  }

  const progressivePlanning = buildProgressiveSummary(contract, attempts, {
    fallbackUsed: allowFallback,
    terminalReason,
    successStrategy: null
  });

  if (allowFallback && latestContext && typeof planner.buildFallback === "function") {
    const fallback = planner.buildFallback({
      missionBrief,
      taskRelevantContext: latestContext,
      resolvedSkills,
      missionId,
      planningTelemetry: progressivePlanning.planningTelemetry,
      terminalReason
    });
    return { ...fallback, planningTelemetry: progressivePlanning.planningTelemetry, progressivePlanning };
  }

  if (lastError) throw lastError;
  const error = new Error("PROGRESSIVE_PLANNING_EXHAUSTED: no unique context strategy produced a plan");
  error.code = "PROGRESSIVE_PLANNING_EXHAUSTED";
  error.progressivePlanning = progressivePlanning;
  throw error;
}

function summarizePlanningPair({ control, treatment } = {}) {
  const controlTelemetry = control?.planningTelemetry || null;
  const treatmentTelemetry = treatment?.planningTelemetry || treatment?.progressivePlanning?.planningTelemetry || null;
  const providerTokenSavings = Number.isFinite(controlTelemetry?.providerTokens) && Number.isFinite(treatmentTelemetry?.providerTokens)
    ? controlTelemetry.providerTokens - treatmentTelemetry.providerTokens : null;
  const estimatedPromptTokenSavings = Number.isFinite(controlTelemetry?.estimatedPromptTokens) && Number.isFinite(treatmentTelemetry?.estimatedPromptTokens)
    ? controlTelemetry.estimatedPromptTokens - treatmentTelemetry.estimatedPromptTokens : null;
  return Object.freeze({
    controlPlanningMode: control?.planningMode || "unknown",
    treatmentPlanningMode: treatment?.planningMode || "unknown",
    controlModelCalls: controlTelemetry?.modelCalls ?? null,
    treatmentModelCalls: treatmentTelemetry?.modelCalls ?? null,
    modelCallSavings: Number.isInteger(controlTelemetry?.modelCalls) && Number.isInteger(treatmentTelemetry?.modelCalls)
      ? controlTelemetry.modelCalls - treatmentTelemetry.modelCalls : null,
    providerTokenSavings,
    estimatedPromptTokenSavings,
    treatmentFallbackUsed: treatment?.progressivePlanning?.fallbackUsed === true,
    treatmentSuccessStrategy: treatment?.progressivePlanning?.successStrategy || null,
    limitation: "A valid graph and lower token count do not by themselves prove equivalent implementation quality; downstream validated outcomes remain required."
  });
}

module.exports = {
  STRATEGIES,
  normalizeProgressivePlanningExperiment,
  strategySequence,
  isContextEscalationFailure,
  aggregatePlanningTelemetry,
  buildProgressiveSummary,
  planProgressively,
  summarizePlanningPair
};
