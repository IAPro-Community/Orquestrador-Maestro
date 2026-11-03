"use strict";

const ACTIVE_STATES = new Set(["CLAIMED", "DISPATCHED", "CANCEL_REQUESTED"]);
const RESERVATION_STATES = new Set(["PENDING_WORKER", ...ACTIVE_STATES, "RECONCILIATION_REQUIRED"]);
const COUNTS = Object.freeze([
  "PENDING_WORKER", "CLAIMED", "DISPATCHED", "CANCEL_REQUESTED",
  "RECONCILIATION_REQUIRED", "COMPLETED", "FAILED", "BLOCKED", "TIMED_OUT", "CANCELLED"
]);

function validate(store, limit) {
  if (!store || typeof store.listRunSubmissions !== "function") {
    throw new TypeError("canonical Maestro RunStore with admissions is required");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new RangeError("limit must be an integer between 1 and 200");
  }
}

function project(row) {
  // Only operational metadata. Never expose prompt text, credentials, approval
  // digest, request hash, model or provider output through diagnostics.
  return Object.freeze({
    submissionId: row.id,
    projectId: row.projectId,
    runId: row.runId || null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    leaseExpiresAt: row.leaseExpiresAt || null
  });
}

function summarize(rows, limit) {
  const counts = Object.fromEntries(COUNTS.map((status) => [status, 0]));
  for (const row of rows) {
    if (!(row.status in counts)) throw new Error("unknown persisted admission status");
    counts[row.status]++;
  }
  return Object.freeze({
    schemaVersion: 1,
    authority: "MAESTRO",
    executionEnabled: false,
    total: rows.length,
    returned: Math.min(limit, rows.length),
    truncated: rows.length > limit,
    reservedWorkspaces: rows.filter((row) => RESERVATION_STATES.has(row.status)).length,
    counts,
    entries: rows.slice(0, limit).map(project)
  });
}

async function inspectRunAdmissions({ store, limit = 100 } = {}) {
  validate(store, limit);
  const rows = await store.listRunSubmissions({});
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return summarize(rows, limit);
}

// Expired lease reconciliation never dispatches, retries, or changes Run
// results. --apply is guarded again by the canonical multiprocess file lock.
async function reconcileExpiredRunAdmissions({ store, limit = 100, apply = false } = {}) {
  validate(store, limit);
  if (typeof store.quarantineExpiredRunSubmission !== "function") {
    throw new TypeError("canonical Maestro RunStore cannot quarantine expired leases");
  }
  if (typeof apply !== "boolean") throw new TypeError("apply must be boolean");
  const checkedAt = new Date().toISOString();
  const now = Date.now();
  const rows = await store.listRunSubmissions({});
  const expired = rows.filter((row) =>
    ACTIVE_STATES.has(row.status) &&
    typeof row.leaseExpiresAt === "string" &&
    Date.parse(row.leaseExpiresAt) <= now
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const actions = [];
  for (const row of expired.slice(0, limit)) {
    if (!apply) {
      actions.push({ ...project(row), outcome: "DRY_RUN", proposedStatus: "RECONCILIATION_REQUIRED" });
      continue;
    }
    try {
      const reconciled = await store.quarantineExpiredRunSubmission(row.id);
      actions.push({
        ...project(reconciled || row),
        outcome: reconciled?.status === "RECONCILIATION_REQUIRED" ? "QUARANTINED" : "NO_LONGER_EXPIRED"
      });
    } catch (error) {
      if (error?.code === "SUBMISSION_LEASE_ACTIVE") {
        actions.push({ ...project(row), outcome: "LEASE_RENEWED" });
        continue;
      }
      throw error;
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    authority: "MAESTRO",
    executionEnabled: false,
    checkedAt,
    applied: apply,
    expiredObserved: expired.length,
    processed: actions.length,
    truncated: expired.length > limit,
    safeToRedispatch: false,
    actions
  });
}

module.exports = { inspectRunAdmissions, reconcileExpiredRunAdmissions };
