"use strict";

const { validateID, bad } = require("./submission-admission");

const TERMINAL_BY_RUN_STATUS = Object.freeze({
  completed: "COMPLETED",
  failed: "FAILED",
  blocked: "BLOCKED",
  timed_out: "TIMED_OUT",
  cancelled: "CANCELLED"
});

function requirePort(name, value) {
  if (typeof value !== "function") {
    throw bad(name + " must be a trusted Maestro callback", "SUBMISSION_SUPERVISOR_UNAVAILABLE");
  }
}

function approvalSubject(row) {
  return Object.freeze({
    submissionId: row.id, projectId: row.projectId,
    planDigest: row.planDigest, artifactDigest: row.artifactDigest,
    approvalDigest: row.approvalDigest, workspaceFingerprint: row.workspaceFingerprint,
    providers: Object.freeze([...row.providers])
  });
}

/**
 * Execute one already-admitted submission, never re-claim a crashed one.
 *
 * This internal one-shot coordinator is not a daemon and never exposed by the
 * Bridge. Trusted callbacks must implement server-side human approval,
 * create a persisted PENDING Maestro Run, and dispatch a provider only after
 * its Run ID is fenced in the ledger.
 *
 * A crashed/expired/uncertain dispatch is quarantined by the reconciler:
 * it is NEVER replayed by this function.
 */
async function superviseSubmissionOnce({
  store, submissionId, workerId, verifyApproval, prepareRun, dispatchRun,
  releasePreparedRun, leaseMs = 30000, heartbeatMs = 5000
} = {}) {
  validateID(submissionId, "submissionId");
  validateID(workerId, "workerId");
  if (!store?.getRunSubmission || !store?.claimRunSubmission ||
      !store?.bindPreparedRunSubmission ||
      !store?.markRunSubmissionDispatched || !store?.finishRunSubmission ||
      !store?.renewRunSubmissionLease || !store?.requestRunSubmissionCancellation) {
    throw bad("canonical Maestro RunStore is required", "SUBMISSION_SUPERVISOR_UNAVAILABLE");
  }
  requirePort("verifyApproval", verifyApproval);
  requirePort("prepareRun", prepareRun);
  requirePort("dispatchRun", dispatchRun);
  if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 600000 ||
      !Number.isInteger(heartbeatMs) || heartbeatMs < 200 || heartbeatMs >= leaseMs / 2) {
    throw bad("heartbeat must be positive and less than half the lease", "INVALID_SUPERVISOR_LEASE");
  }
  const pending = await store.getRunSubmission(submissionId);
  if (!pending || pending.status !== "PENDING_WORKER") {
    throw bad("only fresh pending submissions may be dispatched", "SUBMISSION_NOT_CLAIMABLE");
  }
  if (await verifyApproval(approvalSubject(pending)) !== true) {
    throw bad("trusted approval evidence unavailable", "APPROVAL_NOT_VERIFIED");
  }
  // The storage lock is the authoritative concurrency gate. Two processes
  // racing here cannot claim/dispatch the same submission.
  const claimed = await store.claimRunSubmission(submissionId, { workerId, leaseMs });
  if (!claimed) throw bad("submission disappeared", "SUBMISSION_NOT_CLAIMABLE");

  const controller = new AbortController();
  let leaseFailure = null;
  let heartbeatBusy = false;
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    void store.renewRunSubmissionLease(submissionId, {
      workerId, fence: claimed.fence, leaseMs
    }).then((row) => {
      if (row.status === "CANCEL_REQUESTED" && !controller.signal.aborted) {
        controller.abort(bad("cancellation requested", "SUBMISSION_CANCEL_REQUESTED"));
      }
    }).catch((err) => {
      leaseFailure = err;
      if (!controller.signal.aborted) controller.abort(err);
    }).finally(() => { heartbeatBusy = false; });
  }, heartbeatMs);
  heartbeat.unref?.();

  async function cancelBeforeDispatch(preparedRunId) {
    const row = await store.getRunSubmission(submissionId);
    if (row.status !== "CANCEL_REQUESTED") {
      throw bad("cannot confirm cancellation without a request", "SUBMISSION_INVALID_TRANSITION");
    }
    const terminal = await store.finishRunSubmission(submissionId, {
      workerId, fence: claimed.fence, status: "CANCELLED",
      ...(preparedRunId ? { preparedRunId } : {})
    });
    return Object.freeze({ submission: terminal, runId: null, dispatched: false });
  }

  try {
    const first = await store.getRunSubmission(submissionId);
    if (first.status === "CANCEL_REQUESTED") return await cancelBeforeDispatch();

    const prepared = await prepareRun({
      submission: Object.freeze({ ...claimed }),
      signal: controller.signal
    });
    if (typeof prepared?.runId !== "string") {
      throw bad("prepareRun must return a persisted Maestro Run ID", "RUN_PROVENANCE_MISMATCH");
    }

    // Preparation is durable, but it is not execution. Reserve its exact
    // persisted Run identity before cancellation or any provider side effect.
    // A stale worker cannot bind another process's pending Run after fencing.
    await store.bindPreparedRunSubmission(submissionId, {
      workerId, fence: claimed.fence, runId: prepared.runId
    });

    if (leaseFailure) throw leaseFailure;
    const latest = await store.getRunSubmission(submissionId);
    if (latest.status === "CANCEL_REQUESTED") return await cancelBeforeDispatch(prepared.runId);

    // Approval may have been revoked while a Run was being prepared.
    if (await verifyApproval(approvalSubject(claimed)) !== true) {
      await store.requestRunSubmissionCancellation(submissionId);
      return await cancelBeforeDispatch(prepared.runId);
    }
    if (leaseFailure) throw leaseFailure;

    const dispatched = await store.markRunSubmissionDispatched(submissionId, {
      workerId, fence: claimed.fence, runId: prepared.runId
    });

    // This callback may cause external effects. Never call it unless the
    // ledger already holds the real Run ID and the current worker fence.
    await dispatchRun({
      submission: Object.freeze({ ...dispatched }),
      runId: prepared.runId, signal: controller.signal
    });
    if (leaseFailure) throw leaseFailure;

    const run = await store.getRun(prepared.runId);
    const terminalStatus = TERMINAL_BY_RUN_STATUS[run?.status];
    if (!terminalStatus) {
      throw bad("provider returned without a persisted terminal Run", "RUN_RESULT_UNCERTAIN");
    }
    const terminal = await store.finishRunSubmission(submissionId, {
      workerId, fence: claimed.fence, status: terminalStatus
    });
    return Object.freeze({ submission: terminal, runId: prepared.runId, dispatched: true });
  } finally {
    clearInterval(heartbeat);
    if (!controller.signal.aborted) controller.abort();
    // The RunStore handles the durable cancellation; this cleanup only
    // drops unconsumed same-process handles and is not permission to retry.
    if (typeof releasePreparedRun === "function") {
      try { await releasePreparedRun({ submissionId }); }
      catch { /* cleanup must not mask the original dispatch failure */ }
    }
    // Do not change CLAIMED/DISPATCHED to FAILED here: errors and crashes can
    // leave external side effects uncertain. Let the normal expired-lease
    // reconciler quarantine the submission for operator inspection.
  }
}

module.exports = { superviseSubmissionOnce };
