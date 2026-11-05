"use strict";

const { validateID, bad } = require("./submission-admission");
const { validateStoredExecutableManifest } = require("./executable-manifest");
const { superviseSubmissionOnce } = require("./submission-supervisor");

const LEASE_STATES = new Set(["CLAIMED", "DISPATCHED", "CANCEL_REQUESTED"]);
const RETRYABLE_RACE = new Set(["SUBMISSION_NOT_CLAIMABLE", "SUBMISSION_LEASE_ACTIVE"]);
const safeCode = (error) =>
  typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.code)
    ? error.code : "WORKER_OPERATION_FAILED";

function verifyPorts(options) {
  const { store, projectId, workerId, verifyApproval, prepareRun, dispatchRun,
    batchSize = 4, leaseMs = 30000, heartbeatMs = 5000 } = options;
  validateID(projectId, "projectId");
  validateID(workerId, "workerId");
  for (const name of ["listRunSubmissions", "getRunSubmission", "getExecutableManifest",
    "quarantineExpiredRunSubmission", "claimRunSubmission", "bindPreparedRunSubmission",
    "renewRunSubmissionLease", "markRunSubmissionDispatched", "finishRunSubmission",
    "requestRunSubmissionCancellation"]) {
    if (typeof store?.[name] !== "function") {
      throw bad("canonical RunStore." + name + " is required", "SUBMISSION_WORKER_UNAVAILABLE");
    }
  }
  for (const [name, fn] of Object.entries({ verifyApproval, prepareRun, dispatchRun })) {
    if (typeof fn !== "function") throw bad(name + " must be a trusted Maestro port",
      "SUBMISSION_WORKER_UNAVAILABLE");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32) {
    throw bad("batchSize must be between 1 and 32", "INVALID_WORKER_BATCH");
  }
  if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 600000 ||
      !Number.isInteger(heartbeatMs) || heartbeatMs < 200 || heartbeatMs >= leaseMs / 2) {
    throw bad("invalid worker lease/heartbeat bounds", "INVALID_SUPERVISOR_LEASE");
  }
}

async function manifestBlocker(store, row) {
  // Legacy/unbound admissions are not executable. Never infer an approval
  // from a client-supplied digest or auto-upgrade an old submission.
  if (!row.manifestId) return "EXECUTABLE_MANIFEST_REQUIRED";
  const persisted = await store.getExecutableManifest(row.manifestId);
  if (!persisted) return "EXECUTABLE_MANIFEST_NOT_FOUND";
  const manifest = validateStoredExecutableManifest(persisted);
  if (manifest.id !== row.manifestId ||
      manifest.projectId !== row.projectId ||
      manifest.planDigest !== row.planDigest ||
      manifest.artifactDigest !== row.artifactDigest ||
      manifest.maxCostUSD !== row.maxCostUSD ||
      manifest.tasks.length !== row.taskCount ||
      JSON.stringify(manifest.tasks.map((task) => task.providerId)) !==
        JSON.stringify(row.providers)) {
    return "EXECUTABLE_MANIFEST_MISMATCH";
  }
  if (manifest.tasks.length !== 1) return "MULTI_TASK_DISPATCH_UNSUPPORTED";
  const task = manifest.tasks[0];
  if (task.workspaceFingerprint !== row.workspaceFingerprint ||
      task.modelId !== "default") {
    return "WORKSPACE_OR_MODEL_DISPATCH_UNSUPPORTED";
  }
  // The current single-task adapter cannot enforce a requested sandbox.
  if (task.sandbox !== "none") return "SANDBOX_DISPATCH_UNSUPPORTED";
  if (task.maxAttempts > row.maxAttempts ||
      task.maxDurationMs > row.maxDurationMs ||
      task.maxCostUSD > row.maxCostUSD) {
    return "EXECUTION_LIMITS_MISMATCH";
  }
  return null;
}

/**
 * One bounded Maestro-owned admission-worker cycle.
 *
 * This is the dispatch loop around the existing fenced supervisor, not a
 * competing scheduler/RunStore. Only explicitly manifest-bound, single-task
 * admissions are eligible. Leases whose effects are uncertain are quarantined
 * before examining fresh submissions; they are NEVER retried.
 */
async function processApprovedAdmissionCycle(options = {}) {
  verifyPorts(options);
  const { store, projectId, workerId, verifyApproval, prepareRun, dispatchRun,
    releasePreparedRun, batchSize = 4, leaseMs = 30000, heartbeatMs = 5000 } = options;
  const rows = (await store.listRunSubmissions({ projectId }))
    .filter((row) => row?.projectId === projectId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) ||
      String(a.id).localeCompare(String(b.id)));
  const quarantined = [];
  for (const row of rows.filter((item) => LEASE_STATES.has(item.status) &&
    typeof item.leaseExpiresAt === "string" &&
    Date.parse(item.leaseExpiresAt) <= Date.now()).slice(0, 32)) {
    try {
      const result = await store.quarantineExpiredRunSubmission(row.id);
      if (result?.status === "RECONCILIATION_REQUIRED") quarantined.push(row.id);
    } catch (error) {
      if (error?.code !== "SUBMISSION_LEASE_ACTIVE") throw error;
    }
  }

  const eligible = rows.filter((row) => row.status === "PENDING_WORKER");
  const actions = [];
  for (const row of eligible.slice(0, batchSize)) {
    const current = await store.getRunSubmission(row.id);
    if (!current || current.projectId !== projectId || current.status !== "PENDING_WORKER") {
      actions.push(Object.freeze({ submissionId: row.id, outcome: "CONCURRENT_CHANGE" }));
      continue;
    }
    try {
      const blocker = await manifestBlocker(store, current);
      if (blocker) {
        actions.push(Object.freeze({ submissionId: row.id, outcome: "BLOCKED", reason: blocker }));
        continue;
      }
      const run = await superviseSubmissionOnce({
        store, submissionId: row.id, workerId, verifyApproval, prepareRun,
        dispatchRun, releasePreparedRun, leaseMs, heartbeatMs
      });
      actions.push(Object.freeze({
        submissionId: row.id, outcome: "SUPERVISED",
        status: run.submission.status, runId: run.runId
      }));
    } catch (error) {
      actions.push(Object.freeze({
        submissionId: row.id,
        outcome: RETRYABLE_RACE.has(error?.code) ? "CONCURRENT_CHANGE" : "BLOCKED",
        reason: safeCode(error)
      }));
      // A caught dispatch error may represent external side effects.
      // The durable lease remains claimed/dispatched until reconciliation;
      // NEVER retry this submission from the worker.
    }
  }
  return Object.freeze({
    schemaVersion: 1, authority: "MAESTRO", projectId,
    processed: actions.length, pendingObserved: eligible.length,
    truncated: eligible.length > batchSize,
    quarantined: Object.freeze(quarantined),
    actions: Object.freeze(actions)
  });
}

/**
 * Explicitly started poller. Its ports must be constructed by trusted Maestro
 * bootstrap code; no Bridge call, prompt, provider or fallback is created here.
 * stop() drains the in-process cycle rather than claiming to abort a provider.
 */
function createPollingSubmissionWorker(options = {}) {
  verifyPorts(options);
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1000 ||
      pollIntervalMs > 600000) {
    throw bad("pollIntervalMs must be between 1000 and 600000", "INVALID_WORKER_POLL");
  }
  let stopped = true;
  let timer = null;
  let inFlight = null;

  async function runOnce() {
    if (inFlight) return inFlight;
    const cycle = processApprovedAdmissionCycle(options);
    inFlight = cycle;
    try { return await cycle; }
    finally { if (inFlight === cycle) inFlight = null; }
  }
  function schedule(delayMs) {
    if (stopped) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        const result = await runOnce();
        try { options.onCycle?.(result); } catch { /* reporting is non-authoritative */ }
      } catch (error) {
        try { options.onError?.(Object.freeze({ code: safeCode(error) })); }
        catch { /* never let reporter failure start an unsafe retry */ }
      } finally {
        schedule(pollIntervalMs);
      }
    }, delayMs);
    // Explicit start() must keep the host process alive until stop().
    // Unref here would make a standalone worker exit despite pending admissions.
  }
  return Object.freeze({
    runOnce,
    start() {
      if (!stopped) return false;
      stopped = false;
      schedule(0);
      return true;
    },
    async stop() {
      if (stopped) return false;
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (inFlight) await inFlight.catch(() => {});
      return true;
    },
    get running() { return !stopped; }
  });
}

module.exports = { processApprovedAdmissionCycle, createPollingSubmissionWorker };
