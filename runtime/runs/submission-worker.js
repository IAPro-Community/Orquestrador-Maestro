"use strict";

const { validateID, bad } = require("./submission-admission");
const { superviseSubmissionOnce } = require("./submission-supervisor");
const { createApplicationSubmissionPorts } = require("./application-submission-ports");
const { createTrustedApprovalVerifier, createApprovedTaskResolver } = require("./executable-submission");

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
  pendingBatchLimit = 10, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
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
  const ports = createApplicationSubmissionPorts({
    application, store, projectRoot, workspacePath: projectRoot,
    verifyApproval: createTrustedApprovalVerifier({ store }),
    resolveApprovedTask: createApprovedTaskResolver({ store })
  });

  let stopping = false;
  const inFlight = new Set();

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
    return {
      claimed: batch.length,
      outcomes: settled.map((entry) => entry.status === "fulfilled"
        ? { status: "COMPLETED_SUPERVISION", submissionStatus: entry.value?.submission?.status || null,
            submissionId: entry.value?.submission?.id || null, runId: entry.value?.runId || null,
            taskOutcomes: entry.value?.taskOutcomes || null }
        : { status: "SUPERVISION_ERROR", code: entry.reason?.code || "SUBMISSION_WORKER_ERROR" })
    };
  }

  async function run() {
    stopping = false;
    while (!stopping) {
      let claimed = 0;
      try {
        const result = await step();
        claimed = result.claimed;
      } catch {
        // Transient store/lock contention must not kill the worker; the next
        // cycle retries and the reconciler handles any expired lease.
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
    get inFlightCount() { return inFlight.size; },
    get stopping() { return stopping; }
  };
}

module.exports = { createSubmissionWorker };
