"use strict";

const { DEFAULT_POLICY, rankEvidenceCandidates } = require("./evidence-ranker");

const STRATEGY_BY_BUDGET_TIER = Object.freeze({
  lean: "targeted",
  LEAN: "targeted",
  standard: "balanced",
  STANDARD: "balanced",
  assurance: "deep",
  ASSURANCE: "deep"
});

function strategyForBudget(cognitiveBudget = {}) {
  const key = cognitiveBudget.tier || cognitiveBudget.id || "standard";
  return STRATEGY_BY_BUDGET_TIER[key] || "balanced";
}

function buildResolutionPlan({ cognitiveBudget = {}, evidenceCandidates = [], mode = "shadow", policy = DEFAULT_POLICY } = {}) {
  if (mode !== "shadow") throw new TypeError("adaptive resolution V0 supports shadow mode only");
  const strategy = strategyForBudget(cognitiveBudget);
  const contextTokenBudget = Number.isInteger(cognitiveBudget.contextTokens) ? cognitiveBudget.contextTokens : 0;
  const evidenceAdvice = rankEvidenceCandidates(evidenceCandidates, { strategy, tokenBudget: contextTokenBudget, policy });
  return Object.freeze({
    version: 1,
    mode,
    strategy,
    cognitiveBudgetTier: cognitiveBudget.tier || cognitiveBudget.id || "unknown",
    contextTokenBudget,
    evidenceAdvice
  });
}

function isReviewBlocking(review) {
  return ["rejected", "inconclusive", "unavailable"].includes(String(review?.status || ""));
}

function observedProviderTokens(cognitiveTelemetry = {}) {
  if (cognitiveTelemetry.tokenSource !== "provider-reported" && cognitiveTelemetry.tokenSource !== "derived") return null;
  const input = cognitiveTelemetry.tokenInput;
  const output = cognitiveTelemetry.tokenOutput;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
  return (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
}

function buildResolutionTelemetry({ plan, cognitiveTelemetry = {}, verification, completion, review, status } = {}) {
  const hardValidated = status === "completed"
    && verification?.status === "passed"
    && completion?.eligible === true
    && !isReviewBlocking(review);
  const observedTokens = observedProviderTokens(cognitiveTelemetry);
  return Object.freeze({
    version: 1,
    mode: plan?.mode || "shadow",
    strategy: plan?.strategy || "unknown",
    hardValidated,
    verificationStatus: verification?.status || "unavailable",
    completionEligible: completion?.eligible === true,
    reviewStatus: review?.status || "not-requested",
    observedTokensToValidatedOutcome: hardValidated ? observedTokens : null,
    tokenMetricCompleteness: observedTokens === null ? "unavailable" : "provider-only",
    durationMs: Number.isFinite(cognitiveTelemetry.durationMs) ? cognitiveTelemetry.durationMs : null,
    evidenceCandidates: plan?.evidenceAdvice?.stats?.inputCandidates ?? 0,
    evidenceSelected: plan?.evidenceAdvice?.stats?.selectedCandidates ?? 0,
    estimatedSelectedContextTokens: plan?.evidenceAdvice?.estimatedSelectedTokens ?? 0,
    contextBudgetOverflow: plan?.evidenceAdvice?.budgetOverflow === true,
    limitation: "V0 observes provider token usage and estimated evidence context. It does not claim exact total context cost until context acquisition is instrumented end-to-end."
  });
}

function summarizeResolutionRuns(runs = []) {
  if (!Array.isArray(runs)) throw new TypeError("runs must be an array");
  const rows = runs.map((run) => run?.metadata?.cognitiveTelemetry?.resolution).filter(Boolean);
  const validated = rows.filter((row) => row.hardValidated);
  const observed = validated.map((row) => row.observedTokensToValidatedOutcome).filter(Number.isFinite).sort((a, b) => a - b);
  const median = observed.length === 0 ? null : observed.length % 2 === 1
    ? observed[Math.floor(observed.length / 2)]
    : (observed[observed.length / 2 - 1] + observed[observed.length / 2]) / 2;
  return Object.freeze({
    runs: rows.length,
    validatedRuns: validated.length,
    hardValidationRate: rows.length ? Number((validated.length / rows.length).toFixed(4)) : null,
    medianObservedTokensToValidatedOutcome: median,
    contextBudgetOverflowRate: rows.length ? Number((rows.filter((row) => row.contextBudgetOverflow).length / rows.length).toFixed(4)) : null
  });
}

module.exports = { STRATEGY_BY_BUDGET_TIER, strategyForBudget, buildResolutionPlan, buildResolutionTelemetry, summarizeResolutionRuns };
