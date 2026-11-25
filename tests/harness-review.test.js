"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { previewReview, executeReview } = require("../runtime/integrations/harness/review");

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-review-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(cwd, "README.md"), "fixture");
  git("add", "."); git("commit", "-qm", "initial");
  const snapshot = () => ({ unsafe: false, digest: "a".repeat(64), binding: { headCommit: git("rev-parse", "HEAD"), repositoryId: "repo", workspaceId: "workspace" } });
  const input = { workspacePath: cwd, checks: [{ criterionId: "unit-tests", command: "npm run test", timeoutMs: 1000 }] };
  return { cwd, git, snapshot, input };
}

test("approved review invokes verifier once but cannot certify external Goal", async t => {
  const { input, snapshot } = fixture(t);
  const plan = previewReview(input, { snapshot });
  let calls = 0;
  const report = await executeReview(input, plan.approvalDigest, { snapshot, runCommand: async (command, options) => {
    calls++; assert.equal(command, "npm run test"); assert.equal(options.timeoutMs, 1000); return { exitCode: 0 };
  } });
  assert.equal(calls, 1);
  assert.equal(report.status, "CHECKS_PASSED");
  assert.equal(report.goalState, "unknown");
  assert.equal(report.acceptanceCertified, false);
  assert.equal(report.dispatchAllowed, false);
});

test("missing approval, unsafe checks and changed revision never execute", async t => {
  const { input, git, snapshot } = fixture(t);
  const plan = previewReview(input, { snapshot });
  const options = { snapshot, runCommand: async () => assert.fail("unexpected dispatch") };
  await assert.rejects(executeReview(input, null, options), /EXPLICIT_REVIEW_DIGEST_REQUIRED/);
  assert.throws(() => previewReview({ ...input, checks: [{ ...input.checks[0], command: "git push" }] }, { snapshot }), /INVALID_REVIEW_CHECK/);
  git("commit", "--allow-empty", "-qm", "different revision");
  await assert.rejects(executeReview(input, plan.approvalDigest, options), /REVIEW_SCOPE_CHANGED/);
});

test("dirty worktree or unsafe verifier prevents review", t => {
  const { cwd, input, snapshot } = fixture(t);
  assert.throws(() => previewReview(input, { snapshot: () => ({ ...snapshot(), unsafe: true }) }), /VERIFIER_INPUTS_UNVERIFIED/);
  fs.writeFileSync(path.join(cwd, "README.md"), "modified");
  assert.throws(() => previewReview(input, { snapshot }), /CLEAN_WORKTREE_ROOT_REQUIRED/);
});

test("failed checks stop and workspace drift invalidates otherwise green check", async t => {
  const { cwd, input, snapshot } = fixture(t);
  input.checks.push({ criterionId: "lint", command: "npm run lint", timeoutMs: 1000 });
  const plan = previewReview(input, { snapshot });
  const failed = await executeReview(input, plan.approvalDigest, { snapshot, runCommand: async () => ({ exitCode: 1 }) });
  assert.equal(failed.status, "CHECKS_FAILED"); assert.equal(failed.results.length, 1);
  const drift = await executeReview(input, plan.approvalDigest, { snapshot, runCommand: async () => {
    fs.writeFileSync(path.join(cwd, "README.md"), "modified"); return { exitCode: 0 };
  } });
  assert.equal(drift.status, "WORKSPACE_CHANGED"); assert.equal(drift.results.length, 1);
  assert.equal(drift.acceptanceCertified, false);
});

test("operator review runs the real canonical verifier in a committed fixture", async t => {
  const { cwd, git, input } = fixture(t);
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({
    name: "maestro-review-fixture", private: true, scripts: { test: "node check.js" }
  }));
  fs.writeFileSync(path.join(cwd, "check.js"), "process.exit(0);\n");
  git("add", "."); git("commit", "-qm", "reviewed checks");
  input.checks[0].timeoutMs = 30000;
  const plan = previewReview(input);
  const report = await executeReview(input, plan.approvalDigest);
  assert.equal(report.status, "CHECKS_PASSED");
  assert.equal(report.results[0].exitCode, 0);
  assert.equal(report.acceptanceCertified, false);
  assert.equal(report.dispatchAllowed, false);
});
