"use strict";

const RESOLUTION_MODES = Object.freeze(["shadow", "advisory", "enforce"]);
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

function normalizeMode(mode = "shadow", { enforceAuthorized = false } = {}) {
  if (!RESOLUTION_MODES.includes(mode)) {
    throw new TypeError(`resolution mode must be one of: ${RESOLUTION_MODES.join(", ")}`);
  }
  if (mode === "enforce" && enforceAuthorized !== true) {
    const error = new Error("RESOLUTION_ENFORCE_NOT_READY: enforce requires an explicit promotion authorization");
    error.code = "RESOLUTION_ENFORCE_NOT_READY";
    throw error;
  }
  return mode;
}

function deriveResolutionPolicy({
  cognitiveBudget = {},
  mode = "shadow",
  executionProfile = null,
  enforceAuthorized = false,
  maxEscalations
} = {}) {
  const resolvedMode = normalizeMode(mode, { enforceAuthorized });
  const strategy = strategyForBudget(cognitiveBudget);
  const retries = Number.isInteger(cognitiveBudget.maxIntelligentRetries) ? cognitiveBudget.maxIntelligentRetries : 0;
  const defaultEscalations = strategy === "targeted" ? 2 : strategy === "balanced" ? 1 : 0;
  const escalationLimit = maxEscalations === undefined ? Math.min(2, Math.max(defaultEscalations, retries)) : maxEscalations;
  if (!Number.isInteger(escalationLimit) || escalationLimit < 0 || escalationLimit > 10) {
    throw new TypeError("maxEscalations must be an integer between 0 and 10");
  }

  return Object.freeze({
    schemaVersion: 1,
    source: "derived",
    mode: resolvedMode,
    strategy,
    executionProfile: executionProfile || null,
    budget: Object.freeze({
      id: cognitiveBudget.id || "unknown",
      tier: cognitiveBudget.tier || "unknown",
      contextTokens: Number.isInteger(cognitiveBudget.contextTokens) ? cognitiveBudget.contextTokens : 0,
      maxSkills: Number.isInteger(cognitiveBudget.maxSkills) ? cognitiveBudget.maxSkills : null,
      maxIntelligentRetries: Number.isInteger(cognitiveBudget.maxIntelligentRetries) ? cognitiveBudget.maxIntelligentRetries : null,
      maxReviewers: Number.isInteger(cognitiveBudget.maxReviewers) ? cognitiveBudget.maxReviewers : null,
      maxOverheadPercent: Number.isInteger(cognitiveBudget.maxOverheadPercent) ? cognitiveBudget.maxOverheadPercent : cognitiveBudget.maxOverheadPercent === null ? null : null
    }),
    escalation: Object.freeze({
      max: escalationLimit,
      allowedStrategies: Object.freeze(["targeted", "balanced", "deep"])
    })
  });
}

module.exports = {
  RESOLUTION_MODES,
  STRATEGY_BY_BUDGET_TIER,
  strategyForBudget,
  normalizeMode,
  deriveResolutionPolicy
};
