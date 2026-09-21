"use strict";

const { DEFAULT_POLICY } = require("./evidence-ranker");
const { evaluateEvidenceAgainstPrompt } = require("./prompt-manifest");
const { STRATEGY_BY_BUDGET_TIER, strategyForBudget } = require("./resolution-policy");
const { createResolution, finalizeResolution } = require("./resolution-engine");
const { isReviewBlocking } = require("./resolution-state");

function toLegacyEvidenceAdvice(contract) {
  const evidence = contract.evidence;
  return Object.freeze({
    policyVersion: evidence.policyVersion,
    strategy: contract.strategy,
    tokenBudget: contract.budget.contextTokens,
    estimatedSelectedTokens: evidence.estimatedSelectedTokens,
    budgetOverflow: evidence.budgetOverflow,
    selected: evidence.selected,
    skipped: evidence.rejected,
    duplicates: evidence.duplicates,
    stats: Object.freeze({
      inputCandidates: evidence.candidates,
      uniqueCandidates: evidence.uniqueCandidates,
      selectedCandidates: evidence.selected.length
    })
  });
}

/**
 * Compatibility facade for the historical Adaptive Resolution V1 API.
 * Canonical Runtime code must use createResolution()/finalizeResolution().
 */
function buildResolutionPlan({ cognitiveBudget = {}, evidenceCandidates = [], mode = "shadow", policy = DEFAULT_POLICY } = {}) {
  if (mode !== "shadow") throw new TypeError("adaptive resolution compatibility facade supports shadow mode only");
  const contract = createResolution({
    cognitiveBudget,
    evidenceCandidates,
    mode,
    evidencePolicy: policy
  });
  return Object.freeze({
    version: 1,
    mode: contract.mode,
    strategy: contract.strategy,
    cognitiveBudgetTier: contract.budget.tier || contract.budget.id || "unknown",
    contextTokenBudget: contract.budget.contextTokens,
    evidenceAdvice: toLegacyEvidenceAdvice(contract)
  });
}

function observedProviderTokens(cognitiveTelemetry = {}) {
  if (cognitiveTelemetry.tokenSource !== "provider-reported" && cognitiveTelemetry.tokenSource !== "derived") return null;
  const input = cognitiveTelemetry.tokenInput;
  const output = cognitiveTelemetry.tokenOutput;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
  return (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
}

function evidenceStats(plan) {
  if (plan?.engine === "maestro-resolution-engine") {
    return {
      candidates: plan.evidence?.candidates ?? 0,
      selected: plan.evidence?.selected?.length ?? 0,
      estimatedTokens: plan.evidence?.estimatedSelectedTokens ?? 0,
      overflow: plan.evidence?.budgetOverflow === true
    };
  }
  return {
    candidates: plan?.evidenceAdvice?.stats?.inputCandidates ?? 0,
    selected: plan?.evidenceAdvice?.stats?.selectedCandidates ?? 0,
    estimatedTokens: plan?.evidenceAdvice?.estimatedSelectedTokens ?? 0,
    overflow: plan?.evidenceAdvice?.budgetOverflow === true
  };
}

function buildResolutionTelemetry({ plan, cognitiveTelemetry = {}, verification, completion, review, promptManifest, status } = {}) {
  const canonical = plan?.engine === "maestro-resolution-engine"
    ? finalizeResolution({ contract: plan, runStatus: status, verification, completion, review })
    : null;
  const hardValidated = canonical
    ? canonical.outcome.state === "validated"
    : status === "completed"
      && verification?.status === "passed"
      && completion?.eligible === true
      && !isReviewBlocking(review);
  const observedTokens = observedProviderTokens(cognitiveTelemetry);
  const promptEvaluation = evaluateEvidenceAgainstPrompt({ plan, promptManifest });
  const stats = evidenceStats(plan);
  return Object.freeze({
    version: 2,
    mode: plan?.mode || "shadow",
    strategy: plan?.strategy || "unknown",
    resolutionState: canonical?.outcome?.state || (hardValidated ? "validated" : status === "blocked" ? "blocked" : status === "completed" ? "needs_attention" : status || "unknown"),
    hardValidated,
    verificationStatus: verification?.status || "unavailable",
    completionEligible: completion?.eligible === true,
    reviewStatus: review?.status || "not-requested",
    observedTokensToValidatedOutcome: hardValidated ? observedTokens : null,
    tokenMetricCompleteness: observedTokens === null ? "unavailable" : "provider-only",
    durationMs: Number.isFinite(cognitiveTelemetry.durationMs) ? cognitiveTelemetry.durationMs : null,
    evidenceCandidates: stats.candidates,
    evidenceSelected: stats.selected,
    estimatedSelectedContextTokens: stats.estimatedTokens,
    contextBudgetOverflow: stats.overflow,
    maestroPrompt: promptManifest ? Object.freeze({
      scope: promptManifest.scope,
      promptHash: promptManifest.promptHash,
      manifestHash: promptManifest.manifestHash,
      promptBytes: promptManifest.promptBytes,
      estimatedPromptTokens: promptManifest.estimatedPromptTokens,
      itemCount: promptManifest.itemCount,
      items: promptManifest.items
    }) : null,
    promptEvaluation,
    limitation: "Resolution telemetry is observational. Provider tokens are reported separately from Maestro context estimates and remain null when completeness cannot be proven."
  });
}

function summarizeResolutionRuns(runs = []) {
  if (!Array.isArray(runs)) throw new TypeError("runs must be an array");
  const rows = runs.map((run) => run?.metadata?.cognitiveTelemetry?.resolution).filter(Boolean);
  const validated = rows.filter((row) => row.hardValidated);
  const observed = validated.map((row) => row.observedTokensToValidatedOutcome).filter(Number.isFinite).sort((a, b) => a - b);
  const promptEstimated = rows.map((row) => row.maestroPrompt?.estimatedPromptTokens).filter(Number.isFinite).sort((a, b) => a - b);
  const comparable = rows.filter((row) => row.promptEvaluation?.comparisonReady);
  const overlapValues = comparable.map((row) => row.promptEvaluation.recommendationOverlapRate).filter(Number.isFinite);
  const novelValues = comparable.map((row) => row.promptEvaluation.selectedNovel).filter(Number.isFinite);
  const median = observed.length === 0 ? null : observed.length % 2 === 1
    ? observed[Math.floor(observed.length / 2)]
    : (observed[observed.length / 2 - 1] + observed[observed.length / 2]) / 2;
  const medianPrompt = promptEstimated.length === 0 ? null : promptEstimated.length % 2 === 1
    ? promptEstimated[Math.floor(promptEstimated.length / 2)]
    : (promptEstimated[promptEstimated.length / 2 - 1] + promptEstimated[promptEstimated.length / 2]) / 2;
  return Object.freeze({
    runs: rows.length,
    validatedRuns: validated.length,
    hardValidationRate: rows.length ? Number((validated.length / rows.length).toFixed(4)) : null,
    medianObservedTokensToValidatedOutcome: median,
    promptObservedRuns: rows.filter((row) => row.maestroPrompt).length,
    medianEstimatedMaestroPromptTokens: medianPrompt,
    contextComparableRuns: comparable.length,
    averageRecommendationOverlapRate: overlapValues.length ? Number((overlapValues.reduce((sum, value) => sum + value, 0) / overlapValues.length).toFixed(4)) : null,
    averageSelectedNovelEvidence: novelValues.length ? Number((novelValues.reduce((sum, value) => sum + value, 0) / novelValues.length).toFixed(2)) : null,
    contextBudgetOverflowRate: rows.length ? Number((rows.filter((row) => row.contextBudgetOverflow).length / rows.length).toFixed(4)) : null
  });
}

module.exports = {
  STRATEGY_BY_BUDGET_TIER,
  strategyForBudget,
  buildResolutionPlan,
  buildResolutionTelemetry,
  summarizeResolutionRuns
};
