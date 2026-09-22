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

function deriveResolutionState({ runStatus, verification, completion, review, needsAttention = false, verificationRequired = true } = {}) {
  if (runStatus === "blocked") return "blocked";
  if (["failed", "cancelled", "timed_out"].includes(runStatus)) return "failed";
  if (needsAttention) return "needs_attention";
  if (runStatus === "pending" || runStatus === "running" || !runStatus) return "running";
  if (verification?.status === "pending" || verification?.status === "running") return "verifying";

  const verificationSatisfied = verification?.status === "passed"
    || (verificationRequired === false && verification?.status === "skipped");
  const hardValidated = runStatus === "completed"
    && verificationSatisfied
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

function normalizeMissionTaskState(entry = {}) {
  const explicit = entry.resolutionState
    || entry.state
    || entry?.result?.run?.metadata?.resolution?.outcome?.state;
  if (RESOLUTION_STATES.includes(explicit)) return explicit;
  if (entry.status === "completed") return "needs_attention";
  if (entry.status === "failed" && /^blocked by /u.test(String(entry.error || ""))) return "blocked";
  if (entry.status === "failed") return "failed";
  return "running";
}

function deriveMissionResolutionFromTaskStates(taskStates = [], { objective = null, now = new Date().toISOString() } = {}) {
  if (!Array.isArray(taskStates)) throw new TypeError("taskStates must be an array");
  const normalized = taskStates.map((entry, index) => Object.freeze({
    taskId: String(entry?.taskId || entry?.id || `task-${index + 1}`),
    state: normalizeMissionTaskState(entry)
  }));

  const count = (state) => normalized.filter((entry) => entry.state === state).length;
  const summary = Object.freeze({
    tasks: normalized.length,
    validatedTasks: count("validated"),
    needsAttentionTasks: count("needs_attention"),
    blockedTasks: count("blocked"),
    failedTasks: count("failed"),
    runningTasks: count("running") + count("verifying")
  });

  let state = "needs_attention";
  if (normalized.length > 0 && summary.validatedTasks === normalized.length) state = "validated";
  else if (summary.failedTasks > 0) state = "failed";
  else if (summary.blockedTasks > 0) state = "blocked";
  else if (summary.runningTasks > 0) state = "running";

  const status = state === "validated" ? "completed"
    : state === "failed" ? "failed"
      : state === "running" ? "running"
        : "blocked";

  return Object.freeze({
    schemaVersion: 1,
    engine: "maestro-resolution-engine",
    scope: "mission",
    definitionOfDone: Object.freeze({
      objective,
      rule: "all-planned-tasks-validated"
    }),
    state,
    status,
    reason: state === "validated" ? "all-planned-tasks-validated"
      : normalized.length === 0 ? "no-task-outcomes"
        : state === "failed" ? "one-or-more-tasks-failed"
          : state === "blocked" ? "one-or-more-tasks-blocked"
            : state === "running" ? "task-execution-in-progress"
              : "one-or-more-tasks-need-attention",
    evaluatedAt: now,
    summary,
    tasks: Object.freeze(normalized)
  });
}

function deriveMissionResolution(results = {}, options = {}) {
  if (!results || typeof results !== "object" || Array.isArray(results)) {
    throw new TypeError("mission results must be an object");
  }
  return deriveMissionResolutionFromTaskStates(
    Object.entries(results).map(([taskId, entry]) => ({ taskId, ...(entry || {}) })),
    options
  );
}

module.exports = {
  RESOLUTION_STATES,
  isReviewBlocking,
  deriveResolutionState,
  transitionValidatedOutcome,
  outcomeTransitionEvent,
  normalizeMissionTaskState,
  deriveMissionResolutionFromTaskStates,
  deriveMissionResolution
};
