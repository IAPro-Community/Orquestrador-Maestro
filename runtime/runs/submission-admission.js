"use strict";

const crypto = require("node:crypto");

// Internal Maestro admission contract. These identifiers are bound to a
// project and an immutable reviewed plan; they are never raw execution output.
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const HASH = /^[a-f0-9]{64}$/i;
const ALLOWED_PROVIDERS = new Set(["agy", "opencode", "codex", "claude"]);
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
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
    taskCount, providers: [...providers], maxAttempts, maxDurationMs, maxCostUSD
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

module.exports = { normalizeAdmission, validateID, validateWorker, isTerminal, isWorkspaceOccupied, bad };
