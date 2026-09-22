"use strict";

const { buildResolutionContract } = require("./resolution-contract");
const { transitionValidatedOutcome, outcomeTransitionEvent } = require("./resolution-state");

function createResolution(options = {}) {
  return buildResolutionContract(options);
}

function finalizeResolution({
  contract,
  runStatus,
  verification,
  completion,
  review,
  reason,
  needsAttention = false,
  now
} = {}) {
  if (!contract || contract.engine !== "maestro-resolution-engine") {
    throw new TypeError("canonical Maestro resolution contract is required");
  }
  const definitionOfDone = contract.outcome?.definitionOfDone || {};
  const verificationRequired = (contract.validators || []).some((validator) => validator.required !== false)
    || (definitionOfDone.acceptanceConditions || []).length > 0
    || (definitionOfDone.evidenceRequirements || []).length > 0;
  const outcome = transitionValidatedOutcome(contract.outcome, {
    runStatus,
    verification,
    completion,
    review,
    reason,
    needsAttention,
    verificationRequired,
    definitionOfDone
  }, now || new Date().toISOString());
  return Object.freeze({
    ...contract,
    outcome
  });
}

function resolutionTransition(contract, finalized) {
  return Object.freeze({
    previous: contract?.outcome?.state || null,
    current: finalized?.outcome?.state || null,
    event: outcomeTransitionEvent(contract?.outcome, finalized?.outcome)
  });
}

function resolutionProjection(run = {}) {
  const resolution = run?.metadata?.resolution || null;
  return Object.freeze({
    state: resolution?.outcome?.state || (
      run.status === "blocked" ? "blocked"
        : ["failed", "cancelled", "timed_out"].includes(run.status) ? "failed"
          : run.status === "completed" ? "needs_attention" : "running"
    ),
    strategy: resolution?.strategy || null,
    mode: resolution?.mode || null,
    budget: resolution?.budget || null,
    evidence: resolution?.evidence || null,
    escalation: resolution?.escalation || null,
    validators: resolution?.validators || Object.freeze([]),
    outcome: resolution?.outcome || null
  });
}

module.exports = {
  createResolution,
  finalizeResolution,
  resolutionTransition,
  resolutionProjection
};
