"use strict";

const RESOLUTION_STATES = Object.freeze([
  "running",
  "verifying",
  "needs_attention",
  "blocked",
  "validated",
  "failed"
]);

function isReviewBlocking(review) {
  return ["rejected", "inconclusive", "unavailable"].includes(String(review?.status || ""));
}

function deriveResolutionState({ runStatus, verification, completion, review, needsAttention = false } = {}) {
  if (runStatus === "blocked") return "blocked";
  if (["failed", "cancelled", "timed_out"].includes(runStatus)) return "failed";
  if (needsAttention) return "needs_attention";
  if (runStatus === "pending" || runStatus === "running" || !runStatus) return "running";
  if (verification?.status === "pending" || verification?.status === "running") return "verifying";

  const hardValidated = runStatus === "completed"
    && verification?.status === "passed"
    && completion?.eligible === true
    && !isReviewBlocking(review);
  if (hardValidated) return "validated";

  return runStatus === "completed" ? "needs_attention" : "failed";
}

function transitionValidatedOutcome(previous = {}, input = {}, now = new Date().toISOString()) {
  const state = deriveResolutionState(input);
  const wasValidated = previous?.state === "validated";
  const isValidated = state === "validated";
  const revoked = wasValidated && !isValidated;
  return Object.freeze({
    definitionOfDone: previous?.definitionOfDone || input.definitionOfDone || null,
    state,
    reason: isValidated ? "definition-of-done-satisfied"
      : input.reason || (state === "needs_attention" ? "validation-incomplete" : state),
    validatedAt: isValidated ? (previous?.validatedAt || now) : null,
    revokedAt: revoked ? now : (previous?.revokedAt || null)
  });
}

function outcomeTransitionEvent(previous, next) {
  if (!previous || previous.state === next.state) return null;
  if (next.state === "validated") return previous.state === "validated" ? null : "outcome.validated";
  if (previous.state === "validated" && next.state !== "validated") return "outcome.revoked";
  return null;
}

module.exports = {
  RESOLUTION_STATES,
  isReviewBlocking,
  deriveResolutionState,
  transitionValidatedOutcome,
  outcomeTransitionEvent
};
