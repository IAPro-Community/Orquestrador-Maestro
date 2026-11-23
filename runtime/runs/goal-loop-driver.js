"use strict";

const crypto = require("node:crypto");
const { bad, validateID } = require("./submission-admission");
const { validateStoredExecutableManifest } = require("./executable-manifest");
const { approvedTaskContent } = require("./executable-submission");
const { assessGoalCorrection } = require("./goal-loop-policy");
const { resolveOutcomes } = require("./task-outcome-resolution");

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const DECISIONS = new Set(["PASS", "CORRECTIVE_REVIEW", "BLOCKED_NEEDS_USER"]);
const MAX_EVIDENCE_ITEMS = 10;

const hash = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

/**
 * A durable, immutable Goal Loop audit record. The correction policy is
 * read-only; this record is its persisted evidence. It never dispatches.
 */
function validateGoalLoopDecision(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw bad("malformed goal loop decision", "RUN_STORE_CORRUPTED");
  }
  if (typeof row.id !== "string" || !SAFE_ID.test(row.id) ||
      row.schemaVersion !== 1 ||
      typeof row.submissionId !== "string" || !SAFE_ID.test(row.submissionId) ||
      typeof row.projectId !== "string" || !SAFE_ID.test(row.projectId) ||
      typeof row.planDigest !== "string" || !HASH.test(row.planDigest) ||
      typeof row.artifactDigest !== "string" || !HASH.test(row.artifactDigest) ||
      !DECISIONS.has(row.decision) ||
      (row.reason !== undefined && (typeof row.reason !== "string" || row.reason.length > 64)) ||
      typeof row.iteration !== "number" || !Number.isInteger(row.iteration) ||
      row.iteration < 1 || row.iteration > 20 ||
      typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt)) ||
      !Array.isArray(row.failedTaskIds) || !Array.isArray(row.affectedTaskIds) ||
      !Array.isArray(row.preservedTaskIds) ||
      [...row.failedTaskIds, ...row.affectedTaskIds, ...row.preservedTaskIds]
        .some((id) => typeof id !== "string" || !SAFE_ID.test(id))) {
    throw bad("malformed goal loop decision payload", "RUN_STORE_CORRUPTED");
  }
  if (row.failureFingerprints !== undefined) {
    if (!row.failureFingerprints || typeof row.failureFingerprints !== "object" ||
        Array.isArray(row.failureFingerprints) ||
        Object.entries(row.failureFingerprints).some(([taskId, fingerprint]) =>
          !SAFE_ID.test(taskId) || typeof fingerprint !== "string" || !HASH.test(fingerprint))) {
      throw bad("malformed goal loop failure fingerprints", "RUN_STORE_CORRUPTED");
    }
  }
  if (row.usage === undefined || !row.usage || typeof row.usage !== "object" ||
      !Number.isInteger(row.usage.iterations) || row.usage.iterations < 0 ||
      (row.usage.totalCostUSD !== null &&
        (!Number.isFinite(row.usage.totalCostUSD) || row.usage.totalCostUSD < 0)) ||
      !Number.isFinite(row.usage.elapsedMs) || row.usage.elapsedMs < 0) {
    throw bad("malformed goal loop usage record", "RUN_STORE_CORRUPTED");
  }
  return Object.freeze({
    id: row.id,
    schemaVersion: 1,
    submissionId: row.submissionId,
    projectId: row.projectId,
    planDigest: row.planDigest,
    artifactDigest: row.artifactDigest,
    decision: row.decision,
    ...(row.reason !== undefined ? { reason: row.reason } : {}),
    iteration: row.iteration,
    failedTaskIds: Object.freeze([...row.failedTaskIds]),
    affectedTaskIds: Object.freeze([...row.affectedTaskIds]),
    preservedTaskIds: Object.freeze([...row.preservedTaskIds]),
    ...(row.failureFingerprints !== undefined
      ? { failureFingerprints: Object.freeze({ ...row.failureFingerprints }) } : {}),
    usage: Object.freeze({
      iterations: row.usage.iterations,
      totalCostUSD: row.usage.totalCostUSD,
      elapsedMs: row.usage.elapsedMs
    }),
    createdAt: row.createdAt
  });
}

/**
 * Deterministic failure provenance: same task + same persisted failure
 * evidence yields the same fingerprint, so repeated failures are auditable.
 */
function failureFingerprint({ taskId, runStatus, verificationStatus }) {
  return hash(`${taskId}\0${runStatus}\0${verificationStatus || "none"}`);
}

async function collectTaskResults({ store, manifest, submission, taskOutcomes }) {
  if (!store?.getRun || !store?.getVerification || !store?.listEvidence || !store?.getTask) {
    throw bad("canonical RunStore readers are required for goal assessment",
      "GOAL_LOOP_UNAVAILABLE");
  }
  const semanticTask = async (taskId) => {
    const persistedId = `exec-${manifest.planDigest.slice(0, 16)}-${taskId}`.slice(0, 200);
    const persisted = await store.getTask(persistedId);
    const semantic = persisted?.metadata?.semantic;
    if (!semantic || semantic.id !== taskId) {
      throw bad("approved task content is not resolvable for goal assessment",
        "EXECUTABLE_ARTIFACT_MISMATCH");
    }
    return semantic;
  };
  const failedDeps = (taskId) => (manifest.tasks.find((task) => task.taskId === taskId)?.dependsOn || [])
    .filter((dep) => taskOutcomes[dep] && taskOutcomes[dep] !== "completed");
  const results = new Map();
  for (const task of manifest.tasks) {
    const runId = submission.taskRuns?.[task.taskId];
    if (!runId) {
      const deps = failedDeps(task.taskId);
      results.set(task.taskId, {
        status: "failed",
        error: deps.length > 0
          ? `blocked by failed dependency: ${deps.join(",")}`
          : `blocked by ${taskOutcomes[task.taskId] || "unknown"}`
      });
      continue;
    }
    const run = await store.getRun(runId);
    if (!run) throw bad("bound task Run is missing from the RunStore", "RUN_STORE_CORRUPTED");
    if (run.status === "completed") {
      const verification = await store.getVerification(runId);
      // The approved plan's namespace is used for the *stored plan Task*,
      // but createRun deliberately persists a Run under the semantic taskId
      // (runtime/core/task-identity.js). Never confuse those two identities.
      // Require the Run/task/verification/evidence linkage to agree, without
      // trusting arbitrary provider text or cross-run receipts.
      const rawEvidence = await store.listEvidence({ runId }) || [];
      const boundTask = run.taskId === task.taskId &&
        run.metadata?.semanticTaskId === task.taskId &&
        run.metadata?.semanticTask?.id === task.taskId;
      const evidence = verification?.runId === runId && boundTask
        ? rawEvidence.filter((item) => item?.runId === runId &&
            item.taskId === task.taskId && item.verificationId === verification.id)
          .slice(0, MAX_EVIDENCE_ITEMS)
        : [];
      results.set(task.taskId, {
        status: "completed",
        verification,
        evidence,
        resolutionState: run.metadata?.resolution?.outcome?.state || null,
        qualityFindings: run.metadata?.qualityFindings || []
      });
    } else {
      const verification = await store.getVerification(runId);
      results.set(task.taskId, {
        status: "failed",
        error: `task run ended ${run.status}`,
        verification,
        failureFingerprint: failureFingerprint({
          taskId: task.taskId, runStatus: run.status,
          verificationStatus: verification?.status
        })
      });
    }
  }
  return { results, semanticTasks: await Promise.all(manifest.tasks.map((task) => semanticTask(task.taskId))) };
}

/**
 * Assess a finished submission with the read-only correction policy and
 * persist the decision as a durable audit record. Corrective dispatch is
 * NOT performed here: a CORRECTIVE_REVIEW must be re-admitted through
 * runs.submit with fresh human approval within the approved budget.
 */
async function assessSubmissionGoal({
  store, submissionId, now = new Date()
} = {}) {
  validateID(submissionId, "submissionId");
  if (!store?.getRunSubmission || !store?.listGoalLoopDecisions || !store?.saveGoalLoopDecision) {
    throw bad("canonical RunStore with goal decisions is required", "GOAL_LOOP_UNAVAILABLE");
  }
  const submission = await store.getRunSubmission(submissionId);
  if (!submission?.manifestId) {
    throw bad("goal assessment requires a manifest-bound submission", "GOAL_LOOP_UNAVAILABLE");
  }
  if (!["COMPLETED", "FAILED", "BLOCKED", "TIMED_OUT"].includes(submission.status)) {
    throw bad("goal assessment requires a terminal submission", "GOAL_LOOP_INVALID_STATE");
  }
  const manifest = validateStoredExecutableManifest(
    await store.getExecutableManifest(submission.manifestId));

  // Raw per-task statuses for dependency reasoning. Tasks without a bound
  // Run were dependency-blocked by the supervisor and never dispatched.
  const taskOutcomes = {};
  for (const task of manifest.tasks) {
    const runId = submission.taskRuns?.[task.taskId];
    if (runId) {
      const run = await store.getRun(runId);
      taskOutcomes[task.taskId] = run?.status || "unknown";
    } else {
      taskOutcomes[task.taskId] = "blocked";
    }
  }
  const { results, semanticTasks } = await collectTaskResults({
    store, manifest, submission, taskOutcomes
  });

  // Lineage: every prior decision over the same approved artifact, bounded.
  // Decisions of the submission under assessment are excluded: a replay of
  // the same terminal evidence must not count itself as a new iteration.
  const history = (await store.listGoalLoopDecisions({ projectId: submission.projectId }) || [])
    .filter((row) => row.artifactDigest === submission.artifactDigest &&
      row.submissionId !== submissionId)
    .slice(-100);
  const priorEntries = history.flatMap((row) =>
    Object.entries(row.failureFingerprints || {})
      .map(([taskId, fingerprint]) => ({ taskId, failureFingerprint: fingerprint })));
  const failureFingerprints = {};
  for (const [taskId, result] of results) {
    if (result?.failureFingerprint) failureFingerprints[taskId] = result.failureFingerprint;
  }

  const elapsedMs = Math.max(0, now.getTime() - Date.parse(submission.createdAt));
  const decision = assessGoalCorrection({
    tasks: semanticTasks,
    results,
    planDigest: manifest.planDigest,
    limits: {
      // v1 corrective policy: bounded audit lineage; corrective dispatch
      // always requires fresh human approval regardless of these limits.
      maxIterations: 3,
      maxRepeatSameFailure: 2,
      maxTotalCostUSD: submission.maxCostUSD,
      maxDurationMs: submission.maxDurationMs
    },
    usage: {
      iterations: history.length + 1,
      totalCostUSD: null,
      elapsedMs
    },
    history: priorEntries,
    failureFingerprints
  });
  const iteration = history.length + 1;
  // The first durable decision for a terminal submission is final: a replay
  // returns the existing immutable record instead of re-writing history.
  const existing = (await store.listGoalLoopDecisions({ submissionId }) || [])[0];
  const record = validateGoalLoopDecision({
    // Deterministic per submission+verdict: re-assessing the same terminal
    // submission replays one immutable record instead of duplicating history.
    id: `goal-${hash(`${submissionId}\0${decision.decision}\0${decision.reason || ""}\0${[...decision.failedTaskIds].sort().join(",")}`).slice(0, 40)}`,
    schemaVersion: 1,
    submissionId,
    projectId: submission.projectId,
    planDigest: manifest.planDigest,
    artifactDigest: submission.artifactDigest,
    decision: decision.decision,
    reason: decision.reason,
    iteration,
    failedTaskIds: [...decision.failedTaskIds],
    affectedTaskIds: [...decision.affectedTaskIds],
    preservedTaskIds: [...decision.preservedTaskIds],
    failureFingerprints,
    usage: {
      iterations: history.length + 1,
      totalCostUSD: null,
      elapsedMs
    },
    createdAt: now.toISOString()
  });
  if (existing?.id === record.id) {
    return Object.freeze({ decision, record: validateGoalLoopDecision(existing) });
  }
  await store.saveGoalLoopDecision(record);
  return Object.freeze({ decision, record });
}

module.exports = { validateGoalLoopDecision, assessSubmissionGoal, failureFingerprint, collectTaskResults };
