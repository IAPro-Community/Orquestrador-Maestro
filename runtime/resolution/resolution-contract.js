"use strict";

const { deriveOutcomeContract } = require("../governance/change-governance");
const { DEFAULT_POLICY, rankEvidenceCandidates } = require("./evidence-ranker");
const { deriveResolutionPolicy } = require("./resolution-policy");

function normalizeValidators(task = {}, validators = []) {
  const explicit = Array.isArray(validators) ? validators : [];
  const taskValidators = Array.isArray(task.validators) ? task.validators : [];
  const values = [...explicit, ...taskValidators].map((entry, index) => {
    if (typeof entry === "string") return Object.freeze({ id: entry, required: true, kind: "custom" });
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError(`validator ${index} must be a string or object`);
    const id = String(entry.id || entry.name || "").trim();
    if (!id) throw new TypeError(`validator ${index}.id is required`);
    return Object.freeze({
      id,
      required: entry.required !== false,
      kind: String(entry.kind || "custom"),
      metadata: entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
        ? Object.freeze({ ...entry.metadata }) : undefined
    });
  });
  return Object.freeze(values);
}

function buildResolutionContract({
  task = {},
  cognitiveBudget = {},
  evidenceCandidates = [],
  mode = "shadow",
  executionProfile = null,
  policy,
  evidencePolicy = DEFAULT_POLICY,
  validators = [],
  enforceAuthorized = false
} = {}) {
  const resolvedPolicy = policy || deriveResolutionPolicy({ cognitiveBudget, mode, executionProfile, enforceAuthorized });
  const evidenceAdvice = rankEvidenceCandidates(evidenceCandidates, {
    strategy: resolvedPolicy.strategy,
    tokenBudget: resolvedPolicy.budget.contextTokens,
    policy: evidencePolicy
  });
  const definitionOfDone = deriveOutcomeContract(task);

  return Object.freeze({
    schemaVersion: 1,
    engine: "maestro-resolution-engine",
    policy: resolvedPolicy,
    strategy: resolvedPolicy.strategy,
    mode: resolvedPolicy.mode,
    budget: Object.freeze({
      ...resolvedPolicy.budget,
      reservation: null
    }),
    evidence: Object.freeze({
      policyVersion: evidenceAdvice.policyVersion,
      candidates: evidenceAdvice.stats.inputCandidates,
      uniqueCandidates: evidenceAdvice.stats.uniqueCandidates,
      selected: evidenceAdvice.selected,
      rejected: evidenceAdvice.skipped,
      duplicates: evidenceAdvice.duplicates,
      estimatedSelectedTokens: evidenceAdvice.estimatedSelectedTokens,
      budgetOverflow: evidenceAdvice.budgetOverflow
    }),
    escalation: Object.freeze({
      count: 0,
      max: resolvedPolicy.escalation.max,
      history: Object.freeze([])
    }),
    validators: normalizeValidators(task, validators),
    outcome: Object.freeze({
      definitionOfDone,
      state: "pending",
      reason: null,
      validatedAt: null,
      revokedAt: null
    })
  });
}

module.exports = { normalizeValidators, buildResolutionContract };
