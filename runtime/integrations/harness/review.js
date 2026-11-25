"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const COMMANDS = Object.freeze([
  "npm run test", "npm run tests", "npm run lint", "npm run typecheck", "npm run build",
  "mvn -q test", "python -m pytest -q", "go test ./..."
]);
const HEX = /^[a-f0-9]{64}$/u;
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 5000,
    maxBuffer: 1024 * 1024, shell: false, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("GIT_WORKSPACE_UNAVAILABLE");
  return result.stdout;
}

function cleanSnapshot(workspacePath, snapshot = require("../../verification/input-integrity").verifierConfigSnapshot) {
  if (typeof workspacePath !== "string" || !workspacePath.trim()) throw new Error("WORKSPACE_REQUIRED");
  const requested = fs.realpathSync(path.resolve(workspacePath));
  const cwd = fs.realpathSync(git(requested, ["rev-parse", "--show-toplevel"]).trim());
  // Git for Windows can expand an 8.3 alias while Node preserves it.
  // Reuse the canonical physical-directory authority; do not weaken the
  // root check to case-folded path strings or allow nested directories.
  const { samePhysicalPath } = require("../../runs/workspace-authority");
  if (!samePhysicalPath(cwd, requested) || git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"])) {
    throw new Error("CLEAN_WORKTREE_ROOT_REQUIRED");
  }
  const head = git(cwd, ["rev-parse", "HEAD"]).trim();
  const verifier = snapshot(cwd);
  if (verifier?.unsafe !== false || !HEX.test(verifier.digest || "") || verifier.binding?.headCommit !== head ||
      !verifier.binding.repositoryId || !verifier.binding.workspaceId) throw new Error("VERIFIER_INPUTS_UNVERIFIED");
  return { cwd, head, repositoryId: verifier.binding.repositoryId, workspaceId: verifier.binding.workspaceId,
    verifierDigest: verifier.digest };
}

function normalizeChecks(checks) {
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > 8) throw new Error("ONE_TO_EIGHT_CHECKS_REQUIRED");
  const ids = new Set();
  let total = 0;
  return checks.map(check => {
    if (!check || typeof check !== "object" || Array.isArray(check) ||
        Object.keys(check).some(key => !["criterionId", "command", "timeoutMs"].includes(key)) ||
        typeof check.criterionId !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/u.test(check.criterionId) ||
        ids.has(check.criterionId) || !COMMANDS.includes(check.command) ||
        !Number.isInteger(check.timeoutMs) || check.timeoutMs < 1000 || check.timeoutMs > 120000) {
      throw new Error("INVALID_REVIEW_CHECK");
    }
    ids.add(check.criterionId);
    total += check.timeoutMs;
    if (total > 600000) throw new Error("REVIEW_TIMEOUT_BUDGET_EXCEEDED");
    return { criterionId: check.criterionId, command: check.command, timeoutMs: check.timeoutMs };
  });
}

function previewReview(input, { snapshot } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !["workspacePath", "checks"].includes(key))) throw new Error("INVALID_REVIEW_INPUT");
  const checks = normalizeChecks(input.checks);
  const scope = cleanSnapshot(input.workspacePath, snapshot);
  const plan = { schemaVersion: 1, ...scope, checks };
  return { ...plan, approvalDigest: digest(plan), goalState: "unknown", dispatchAllowed: false };
}

// Operator-invoked review only. A hash binds a reviewed plan, not a human identity.
// This does not create a Run, a Goal decision, or DETERMINISTIC_VERIFIED receipts.
async function executeReview(input, approvedDigest, { snapshot, runCommand } = {}) {
  if (typeof approvedDigest !== "string" || !HEX.test(approvedDigest)) throw new Error("EXPLICIT_REVIEW_DIGEST_REQUIRED");
  const plan = previewReview(input, { snapshot });
  if (plan.approvalDigest !== approvedDigest) throw new Error("REVIEW_SCOPE_CHANGED");
  const run = runCommand || require("../../verification/engine").runCommand;
  const results = [];
  let status = "CHECKS_PASSED";
  for (const check of plan.checks) {
    if (previewReview(input, { snapshot }).approvalDigest !== approvedDigest) throw new Error("REVIEW_SCOPE_CHANGED");
    const result = await run(check.command, { cwd: plan.cwd, timeoutMs: check.timeoutMs });
    const passed = result?.exitCode === 0 && !result.timedOut && !result.error && !result.denied && !result.terminationUncertain;
    results.push({ criterionId: check.criterionId, passed, exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null,
      timedOut: result?.timedOut === true, terminationUncertain: result?.terminationUncertain === true });
    try {
      if (previewReview(input, { snapshot }).approvalDigest !== approvedDigest) throw new Error("REVIEW_SCOPE_CHANGED");
    } catch {
      status = "WORKSPACE_CHANGED";
      break;
    }
    if (!passed) { status = "CHECKS_FAILED"; break; }
  }
  return { schemaVersion: 1, approvalDigest: approvedDigest, head: plan.head, workspaceId: plan.workspaceId,
    verifierDigest: plan.verifierDigest, status, results, goalState: "unknown", dispatchAllowed: false,
    acceptanceCertified: false, coverage: "operator-reviewed-checks-only" };
}

module.exports = { COMMANDS, previewReview, executeReview };
