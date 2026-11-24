"use strict";

const { validateID, bad } = require("./submission-admission");
const { superviseSubmissionOnce } = require("./submission-supervisor");
const { createApplicationSubmissionPorts } = require("./application-submission-ports");
const { createTrustedApprovalVerifier, createApprovedTaskResolver } = require("./executable-submission");
const { assessSubmissionGoal } = require("./goal-loop-driver");
const { sanitizeDiagnostic } = require("../telemetry/diagnostic-sanitizer");
const GOAL_TERMINALS = new Set(["COMPLETED", "FAILED", "BLOCKED", "TIMED_OUT"]);

function diagnosticCode(error, fallback) {
  const code = String(error?.code || "");
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(code) ? code : fallback;
}

/**
 * Persistent, Maestro-owned bounded polling worker. It claims admitted
 * submissions with lease/fencing and dispatches them through the trusted
 * application ports — one process, one claim loop, no second scheduler.
 *
 * A crashed or expired claim is never replayed here: the reconciler
 * quarantines it (`RECONCILIATION_REQUIRED`) and a human decides. The worker
 * therefore only ever claims fresh `PENDING_WORKER` entries.
 */
function createSubmissionWorker({
  application, store, projectRoot, workerId,
  concurrency = 1, pollIntervalMs = 1000, leaseMs = 30000, heartbeatMs = 5000,
  pendingBatchLimit = 10, goalLoop = true, onError = null,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  validateID(workerId, "workerId");
  if (!application?.createRun || !application?.executePreparedRun) {
    throw bad("trusted Maestro application is required", "SUBMISSION_WORKER_UNAVAILABLE");
  }
  if (!store?.listRunSubmissions || !store?.getRunSubmission || !store?.claimRunSubmission) {
    throw bad("canonical Maestro RunStore is required", "SUBMISSION_WORKER_UNAVAILABLE");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw bad("concurrency must be between 1 and 8", "INVALID_SUBMISSION_WORKER");
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 50 || pollIntervalMs > 60000 ||
      !Number.isInteger(pendingBatchLimit) || pendingBatchLimit < 1 || pendingBatchLimit > 32) {
    throw bad("invalid worker polling limits", "INVALID_SUBMISSION_WORKER");
  }
  if (onError !== null && typeof onError !== "function") {
    throw bad("onError must be a function", "INVALID_SUBMISSION_WORKER");
  }
  const ports = createApplicationSubmissionPorts({
    application, store, projectRoot, workspacePath: projectRoot,
    verifyApproval: createTrustedApprovalVerifier({ store }),
    resolveApprovedTask: createApprovedTaskResolver({ store })
  });

  let stopping = false;
  let stepPending = null;
  let pendingCursor = 0;
  let goalCursor = 0;
  const lastReported = new Map();
  const inFlight = new Set();
  let lastPollError = null;
  let consecutivePollErrors = 0;
  let lastSuccessfulPollAt = null;

  function recordPollError(error) {
    const code = diagnosticCode(error, "WORKER_POLL_ERROR");
    const previousCode = lastPollError?.code || null;
    lastPollError = Object.freeze({
      code,
      message: sanitizeDiagnostic(error?.message || "Worker polling failed", { maxChars: 512 }),
      at: new Date().toISOString()
    });
    consecutivePollErrors++;
    if (onError && (consecutivePollErrors === 1 || code !== previousCode ||
        consecutivePollErrors % 60 === 0)) {
      try {
        onError(Object.freeze({ workerId, ...lastPollError, consecutivePollErrors }));
      } catch { /* Operational logging must never kill the worker. */ }
    }
  }


  function reportOperationalError(stage, error, submissionId) {
    const code = diagnosticCode(error, "SUBMISSION_WORKER_ERROR");
    const key = stage + ":" + code;
    const now = Date.now();
    if (lastReported.has(key) && now - lastReported.get(key) < 60000) return;
    if (lastReported.size >= 64) lastReported.clear();
    lastReported.set(key, now);
    if (onError) {
      try { onError(Object.freeze({
        workerId, stage, submissionId, code,
        message: sanitizeDiagnostic(error?.message || "Worker operation failed", { maxChars: 512 }),
        at: new Date(now).toISOString()
      })); } catch { /* Diagnostics must not change execution. */ }
    }
  }

  // Recovery only reads terminal manifests and persists missing decisions.
  // It never claims a submission or dispatches a provider.
  async function recoverGoals() {
    if (!goalLoop || !store.listGoalLoopDecisions) return;
    const rows = await store.listRunSubmissions({});
    const decisions = await store.listGoalLoopDecisions({});
    const existing = new Set(decisions.map((row) => row.submissionId));
    const missing = rows.filter((row) => row.manifestId &&
      GOAL_TERMINALS.has(row.status) && !existing.has(row.id));
    if (!missing.length) return;
    const offset = goalCursor % missing.length;
    const batch = missing.slice(offset).concat(missing.slice(0, offset)).slice(0, pendingBatchLimit);
    goalCursor = offset + batch.length;
    for (const row of batch) {
      if (stopping) break;
      try { await assessSubmissionGoal({ store, submissionId: row.id }); }
      catch (error) { reportOperationalError("goal-recovery", error, row.id); }
    }
  }

  async function performStep() {
    if (stopping) return { claimed: 0, outcomes: [] };
    const pending = (await store.listRunSubmissions({ status: "PENDING_WORKER" }) || []);
    await recoverGoals();
    if (stopping) return { claimed: 0, outcomes: [] };
    const slots = Math.max(0, concurrency - inFlight.size);
    const offset = pending.length ? pendingCursor % pending.length : 0;
    const batch = pending.slice(offset).concat(pending.slice(0, offset))
      .slice(0, Math.min(slots, pendingBatchLimit));
    pendingCursor = offset + batch.length;
    if (batch.length === 0) return { claimed: 0, outcomes: [] };
    let claimed = 0;
    const executions = batch.map((row) => {
      const execution = superviseSubmissionOnce({
        store, submissionId: row.id, workerId,
        verifyApproval: ports.verifyApproval,
        prepareRun: ports.prepareRun,
        dispatchRun: ports.dispatchRun,
        releasePreparedRun: ports.releasePreparedRun,
        onClaim: () => { claimed++; },
        leaseMs, heartbeatMs
      }).finally(() => inFlight.delete(execution));
      inFlight.add(execution);
      return execution;
    });
    const settled = await Promise.allSettled(executions);
    const outcomes = [];
    for (const [index, entry] of settled.entries()) {
      if (entry.status !== "fulfilled") {
        reportOperationalError("supervision", entry.reason, batch[index].id);
        outcomes.push({ status: "SUPERVISION_ERROR", code: diagnosticCode(entry.reason, "SUBMISSION_WORKER_ERROR") });
        continue;
      }
      const value = entry.value || {};
      const outcome = {
        status: "COMPLETED_SUPERVISION",
        submissionStatus: value.submission?.status || null,
        submissionId: value.submission?.id || null,
        runId: value.runId || null,
        taskOutcomes: value.taskOutcomes || null
      };
      // A submission COMPLETED means only that the provider's Run(s)
      // finished. It NEVER proves a Goal was validated. Assess successful
      // as well as failed terminals through canonical verification/resolution.
      // Still read-only: no unattended correction is authorized by this step.
      if (goalLoop && outcome.submissionId &&
          GOAL_TERMINALS.has(outcome.submissionStatus)) {
        try {
          const assessment = await assessSubmissionGoal({ store, submissionId: outcome.submissionId });
          outcome.goalLoop = {
            decision: assessment.decision.decision,
            reason: assessment.decision.reason || null,
            affectedTaskIds: [...assessment.decision.affectedTaskIds],
            preservedTaskIds: [...assessment.decision.preservedTaskIds]
          };
        } catch (error) {
          reportOperationalError("goal-assessment", error, outcome.submissionId);
          outcome.goalLoop = { decision: "ASSESSMENT_ERROR", code: diagnosticCode(error, "GOAL_LOOP_UNAVAILABLE") };
        }
      }
      outcomes.push(outcome);
    }
    return { claimed, outcomes };
  }

  function step() {
    if (stepPending) return stepPending;
    stepPending = performStep().finally(() => { stepPending = null; });
    return stepPending;
  }

  async function run() {
    stopping = false;
    while (!stopping) {
      let claimed = 0;
      try {
        const result = await step();
        claimed = result.outcomes.some((outcome) => outcome.status === "SUPERVISION_ERROR") ? 0 : result.claimed;
        consecutivePollErrors = 0;
        lastSuccessfulPollAt = new Date().toISOString();
      } catch (error) {
        // Transient storage failures are recoverable but must be explainable.
        recordPollError(error);
        claimed = 0;
      }
      if (claimed === 0) await sleep(pollIntervalMs);
    }
    await Promise.allSettled([...inFlight]);
  }

  return {
    workerId,
    step,
    run,
    async stop() {
      stopping = true;
      if (stepPending) await Promise.allSettled([stepPending]);
      await Promise.allSettled([...inFlight]);
    },
    diagnostics() {
      return Object.freeze({ workerId, stopping, inFlightCount: inFlight.size,
        consecutivePollErrors, lastSuccessfulPollAt, lastPollError });
    },
    get inFlightCount() { return inFlight.size; },
    get stopping() { return stopping; }
  };
}

module.exports = { createSubmissionWorker };
