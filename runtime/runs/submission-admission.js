"use strict";

const crypto = require("node:crypto");

// Internal Maestro admission contract. These identifiers are bound to a
// project and an immutable reviewed plan; they are never raw execution output.
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const HASH = /^[a-f0-9]{64}$/i;
const ALLOWED_PROVIDERS = new Set(["agy", "opencode", "codex", "claude"]);
const TERMINAL = new Set(["COMPLETED", "FAILED", "BLOCKED", "TIMED_OUT", "CANCELLED"]);
const ACTIVE = new Set(["PENDING_WORKER", "CLAIMED", "DISPATCHED", "CANCEL_REQUESTED", "RECONCILIATION_REQUIRED"]);

function bad(message, code = "INVALID_SUBMISSION") {
  const error = new TypeError(message);
  error.code = code;
  return error;
}
function validateID(value, name) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw bad(name + " must be a safe id of 8..128 characters");
  return value;
}
function validateDigest(value, name) {
  if (typeof value !== "string" || !HASH.test(value)) throw bad(name + " must be an SHA-256 hex digest");
  return value.toLowerCase();
}

function normalizeAdmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("admission must be an object");
  const projectId = validateID(input.projectId, "projectId");
  const clientKey = validateID(input.clientKey, "clientKey");
  const planDigest = validateDigest(input.planDigest, "planDigest");
  const artifactDigest = validateDigest(input.artifactDigest, "artifactDigest");
  const workspaceFingerprint = validateDigest(input.workspaceFingerprint, "workspaceFingerprint");
  // This digest binds the human approval receipt to the exact reviewed plan;
  // a future Bridge adapter must verify that receipt server-side.
  const approvalDigest = validateDigest(input.approvalDigest, "approvalDigest");
  const taskCount = input.taskCount;
  if (!Number.isInteger(taskCount) || taskCount < 1 || taskCount > 32) {
    throw bad("taskCount must be between 1 and 32");
  }
  const providers = input.providers;
  if (!Array.isArray(providers) || providers.length !== taskCount ||
      providers.some((id) => typeof id !== "string" || !ALLOWED_PROVIDERS.has(id))) {
    throw bad("providers must explicitly identify a supported provider for each task");
  }
  const maxAttempts = input.maxAttempts;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw bad("maxAttempts must be between 1 and 5");
  }
  const maxDurationMs = input.maxDurationMs;
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1000 || maxDurationMs > 7_200_000) {
    throw bad("maxDurationMs must be between 1000 and 7200000");
  }
  const maxCostUSD = input.maxCostUSD;
  if (typeof maxCostUSD !== "number" || !Number.isFinite(maxCostUSD) || maxCostUSD < 0 || maxCostUSD > 100) {
    throw bad("maxCostUSD must be a finite budget between 0 and 100");
  }
  // Fixed-order serialization; replays cannot change the approved scope or
  // provider mapping. No description, credential, token, prompt or raw output
  // is stored in the admission index.
  const immutable = {
    projectId, planDigest, artifactDigest, workspaceFingerprint, approvalDigest,
    taskCount, providers: Object.freeze([...providers]), maxAttempts, maxDurationMs, maxCostUSD
  };
  const requestDigest = crypto.createHash("sha256").update(JSON.stringify(immutable)).digest("hex");
  return Object.freeze({ clientKey, requestDigest, ...immutable });
}

function validateWorker(ownerId, fence, leaseMs) {
  validateID(ownerId, "workerId");
  if (fence !== undefined && (!Number.isSafeInteger(fence) || fence < 1)) throw bad("fence must be a positive integer");
  if (leaseMs !== undefined && (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 600_000)) {
    throw bad("leaseMs must be between 1000 and 600000");
  }
}
function isTerminal(status) { return TERMINAL.has(status); }
function isWorkspaceOccupied(status) { return ACTIVE.has(status); }

function validateAdmissionLedger(rows) {
  if (!Array.isArray(rows)) throw bad("RunStore runSubmissions collection must be an array", "RUN_STORE_CORRUPTED");
  const ids = new Set(), keys = new Set(), occupied = new Set();
  const statuses = new Set(["PENDING_WORKER", "CLAIMED", "DISPATCHED", "CANCEL_REQUESTED",
    "COMPLETED", "FAILED", "BLOCKED", "TIMED_OUT", "CANCELLED", "RECONCILIATION_REQUIRED"]);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw bad("malformed run submission in persisted RunStore", "RUN_STORE_CORRUPTED");
    }
    let normalized;
    try { normalized = normalizeAdmission(row); }
    catch { throw bad("malformed immutable submission fields", "RUN_STORE_CORRUPTED"); }
    if (normalized.requestDigest !== row.requestDigest) {
      throw bad("submission request digest mismatch", "RUN_STORE_CORRUPTED");
    }
    if (!SAFE_ID.test(row.id || "") || ids.has(row.id) ||
        !statuses.has(row.status) || !Number.isSafeInteger(row.fence) || row.fence < 0) {
      throw bad("malformed or repeated submission identity/state", "RUN_STORE_CORRUPTED");
    }
    const key = row.projectId + "\0" + row.clientKey;
    if (keys.has(key)) throw bad("duplicate persisted idempotency key", "RUN_STORE_CORRUPTED");
    if (isWorkspaceOccupied(row.status) && occupied.has(row.workspaceFingerprint)) {
      throw bad("duplicate active workspace reservation", "RUN_STORE_CORRUPTED");
    }
    if (row.workerId !== null && (typeof row.workerId !== "string" || !SAFE_ID.test(row.workerId))) {
      throw bad("invalid worker identity", "RUN_STORE_CORRUPTED");
    }
    if (row.runId !== null && (typeof row.runId !== "string" || !SAFE_ID.test(row.runId))) {
      throw bad("invalid Run identity", "RUN_STORE_CORRUPTED");
    }
    if (row.leaseExpiresAt !== null &&
        (typeof row.leaseExpiresAt !== "string" || !Number.isFinite(Date.parse(row.leaseExpiresAt)))) {
      throw bad("invalid worker lease", "RUN_STORE_CORRUPTED");
    }
    const workerOwned = ["CLAIMED", "DISPATCHED", "CANCEL_REQUESTED"].includes(row.status);
    if (workerOwned !== (row.workerId !== null && row.leaseExpiresAt !== null)) {
      throw bad("submission worker lease/state mismatch", "RUN_STORE_CORRUPTED");
    }
    if ((row.status === "CLAIMED" && row.runId !== null) ||
        (row.status === "DISPATCHED" && row.runId === null) ||
        (row.status === "PENDING_WORKER" && (row.workerId !== null || row.runId !== null))) {
      throw bad("submission lifecycle is contradictory", "RUN_STORE_CORRUPTED");
    }
    ids.add(row.id); keys.add(key);
    if (isWorkspaceOccupied(row.status)) occupied.add(row.workspaceFingerprint);
  }
  return rows;
}

module.exports = { normalizeAdmission, validateID, validateWorker, isTerminal,
  isWorkspaceOccupied, validateAdmissionLedger, bad };
