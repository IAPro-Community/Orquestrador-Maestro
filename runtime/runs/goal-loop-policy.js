"use strict";

const { resolveOutcomes, FAILED_DEPENDENCY_REASON } = require("./task-outcome-resolution");

const HASH = /^[a-f0-9]{64}$/i;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Read-only decision over canonical Maestro task results and approval-bounded
 * telemetry. The caller must persist decisions/receipts in the existing
 * RunStore; this module NEVER dispatches, retries or creates a second ledger.
 */
function assessGoalCorrection({
  tasks, results, planDigest, limits, usage, history = [], failureFingerprints = {}
} = {}) {
  if (!HASH.test(planDigest || "")) throw new TypeError("approved planDigest required");
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 32 ||
      !(results instanceof Map)) throw new TypeError("bounded tasks and canonical result Map required");
  if (!limits || !usage ||
      !Number.isInteger(limits.maxIterations) || limits.maxIterations < 1 || limits.maxIterations > 20 ||
      !Number.isInteger(limits.maxRepeatSameFailure) || limits.maxRepeatSameFailure < 1 ||
      limits.maxRepeatSameFailure > 5 ||
      !Number.isFinite(limits.maxTotalCostUSD) || limits.maxTotalCostUSD < 0 ||
      !Number.isInteger(limits.maxDurationMs) || limits.maxDurationMs < 1000 ||
      !Number.isInteger(usage.iterations) || usage.iterations < 0 ||
      !Number.isFinite(usage.totalCostUSD) || usage.totalCostUSD < 0 ||
      !Number.isFinite(usage.elapsedMs) || usage.elapsedMs < 0 ||
      !Array.isArray(history) || history.length > 100) {
    throw new TypeError("bounded verified Goal Loop budget, usage and history required");
  }
  const byId = new Map();
  const dependents = new Map();
  const indegree = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== "string" || !SAFE_ID.test(task.id) ||
        byId.has(task.id) || !Array.isArray(task.dependsOn)) {
      throw new TypeError("approved DAG has invalid or duplicate task identifiers");
    }
    byId.set(task.id, task);
    dependents.set(task.id, []);
    indegree.set(task.id, 0);
  }
  for (const task of tasks) {
    const seen = new Set();
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency) || dependency === task.id || seen.has(dependency)) {
        throw new TypeError("approved DAG has invalid dependencies");
      }
      seen.add(dependency);
      dependents.get(dependency).push(task.id);
      indegree.set(task.id, indegree.get(task.id) + 1);
    }
  }
  const ready = [...tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id)];
  let visited = 0;
  while (ready.length) {
    const current = ready.shift();
    visited++;
    for (const next of dependents.get(current)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  if (visited !== tasks.length) throw new TypeError("approved DAG contains a cycle");

  const outcomes = resolveOutcomes({ tasks, results });
  const failedIds = tasks.filter((task) => outcomes.get(task.id).status === "failed")
    .map((task) => task.id);
  const unsafe = tasks.filter((task) => {
    const outcome = outcomes.get(task.id);
    return (outcome.status === "blocked" && outcome.reason !== FAILED_DEPENDENCY_REASON) ||
      outcome.reason === "COMPLETION_EVIDENCE_REQUIRED";
  });
  const base = {
    schemaVersion: 1, authority: "MAESTRO", planDigest: planDigest.toLowerCase(),
    executionEnabled: false, requiresApproval: true
  };
  const blocked = (reason) => Object.freeze({
    ...base, decision: "BLOCKED_NEEDS_USER", reason,
    failedTaskIds: Object.freeze([...failedIds]),
    affectedTaskIds: Object.freeze([]),
    preservedTaskIds: Object.freeze([])
  });
  if (unsafe.length) return blocked("EVIDENCE_OR_POLICY_REVIEW_REQUIRED");
  if (failedIds.length === 0) {
    // All tasks must have real verified completion evidence; resolveOutcomes
    // refuses a claimed completion with missing verification or criteria.
    if ([...outcomes.values()].every((outcome) => outcome.status === "completed")) {
      return Object.freeze({
        ...base, decision: "PASS", requiresApproval: false,
        failedTaskIds: Object.freeze([]),
        affectedTaskIds: Object.freeze([]),
        preservedTaskIds: Object.freeze(tasks.map((task) => task.id))
      });
    }
    return blocked("INCOMPLETE_OR_BLOCKED_GOAL");
  }
  if (usage.iterations >= limits.maxIterations) return blocked("ITERATION_BUDGET_EXHAUSTED");
  if (usage.totalCostUSD >= limits.maxTotalCostUSD) return blocked("COST_BUDGET_EXHAUSTED");
  if (usage.elapsedMs >= limits.maxDurationMs) return blocked("DURATION_BUDGET_EXHAUSTED");

  if (!failureFingerprints || typeof failureFingerprints !== "object" ||
      Array.isArray(failureFingerprints)) return blocked("FAILURE_PROVENANCE_REQUIRED");
  for (const taskId of failedIds) {
    const fingerprint = failureFingerprints[taskId];
    if (typeof fingerprint !== "string" || !HASH.test(fingerprint)) {
      return blocked("FAILURE_PROVENANCE_REQUIRED");
    }
    if (history.some((entry) => !entry || typeof entry !== "object" ||
        !SAFE_ID.test(entry.taskId || "") || !HASH.test(entry.failureFingerprint || ""))) {
      return blocked("INVALID_CANONICAL_ITERATION_HISTORY");
    }
    const repeated = history.filter((entry) =>
      entry.taskId === taskId && entry.failureFingerprint.toLowerCase() === fingerprint.toLowerCase()).length;
    if (repeated >= limits.maxRepeatSameFailure) return blocked("REPEATED_FAILURE_LIMIT");
  }
  // Invalidate only failed tasks and transitive descendants. Independently
  // verified branches retain their receipts; nothing is redispatched here.
  const affected = new Set(failedIds);
  const queue = [...failedIds];
  while (queue.length) {
    for (const dependent of dependents.get(queue.shift())) {
      if (affected.has(dependent)) continue;
      affected.add(dependent);
      queue.push(dependent);
    }
  }
  return Object.freeze({
    ...base, decision: "CORRECTIVE_REVIEW",
    failedTaskIds: Object.freeze([...failedIds]),
    affectedTaskIds: Object.freeze(tasks.filter((task) => affected.has(task.id)).map((task) => task.id)),
    preservedTaskIds: Object.freeze(tasks.filter((task) => !affected.has(task.id)).map((task) => task.id))
  });
}

module.exports = { assessGoalCorrection };
