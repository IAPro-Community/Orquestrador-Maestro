"use strict";

const { validateID, bad } = require("./submission-admission");
const { superviseSubmissionOnce } = require("./submission-supervisor");
const { createApplicationSubmissionPorts } = require("./application-submission-ports");
const { createTrustedApprovalVerifier, createApprovedTaskResolver } = require("./executable-submission");
const { assessSubmissionGoal } = require("./goal-loop-driver");
const { sanitizeDiagnostic } = require("../telemetry/diagnostic-sanitizer");

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
  const inFlight = new Set();
  let lastPollError = null;
  let consecutivePollErrors = 0;
  let lastSuccessfulPollAt = null;

  function recordPollError(error) {
    const rawCode = String(error?.code || "");
    const code = /^[A-Z][A-Z0-9_]{1,63}$/.test(rawCode) ? rawCode : "WORKER_POLL_ERROR";
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


  async function step() {
    if (stopping) return { claimed: 0, outcomes: [] };
    const pending = (await store.listRunSubmissions({ status: "PENDING_WORKER" }) || [])
      .slice(0, pendingBatchLimit);
    const slots = Math.max(0, concurrency - inFlight.size);
    const batch = pending.slice(0, slots);
    if (batch.length === 0) return { claimed: 0, outcomes: [] };
    const executions = batch.map((row) => {
      const execution = superviseSubmissionOnce({
        store, submissionId: row.id, workerId,
        verifyApproval: ports.verifyApproval,
        prepareRun: ports.prepareRun,
        dispatchRun: ports.dispatchRun,
        releasePreparedRun: ports.releasePreparedRun,
        leaseMs, heartbeatMs
      }).finally(() => inFlight.delete(execution));
      inFlight.add(execution);
      return execution;
    });
    const settled = await Promise.allSettled(executions);
    const outcomes = [];
    for (const entry of settled) {
      if (entry.status !== "fulfilled") {
        outcomes.push({ status: "SUPERVISION_ERROR", code: entry.reason?.code || "SUBMISSION_WORKER_ERROR" });
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
          ["COMPLETED", "FAILED", "BLOCKED", "TIMED_OUT"].includes(outcome.submissionStatus)) {
        try {
          const assessment = await assessSubmissionGoal({ store, submissionId: outcome.submissionId });
          outcome.goalLoop = {
            decision: assessment.decision.decision,
            reason: assessment.decision.reason || null,
            affectedTaskIds: [...assessment.decision.affectedTaskIds],
            preservedTaskIds: [...assessment.decision.preservedTaskIds]
          };
        } catch (error) {
          outcome.goalLoop = { decision: "ASSESSMENT_ERROR", code: error?.code || "GOAL_LOOP_UNAVAILABLE" };
        }
      }
      outcomes.push(outcome);
    }
    return { claimed: batch.length, outcomes };
  }

  async function run() {
    stopping = false;
    while (!stopping) {
      let claimed = 0;
      try {
        const result = await step();
        claimed = result.claimed;
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
