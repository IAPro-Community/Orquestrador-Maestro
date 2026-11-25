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

test("review accepts equivalent physical root paths but rejects a nested directory", t => {
  const { cwd, git, input, snapshot } = fixture(t);
  const nested = path.join(cwd, "nested");
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested, "tracked.txt"), "fixture");
  git("add", "."); git("commit", "-qm", "nested directory");
  assert.doesNotThrow(() => previewReview(input, { snapshot }));
  assert.throws(() => previewReview({ ...input, workspacePath: nested }, { snapshot }), /CLEAN_WORKTREE_ROOT_REQUIRED/);
  const aliasDir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-review-alias-"));
  t.after(() => fs.rmSync(aliasDir, { recursive: true, force: true }));
  const alias = path.join(aliasDir, "project");
  fs.symlinkSync(cwd, alias, process.platform === "win32" ? "junction" : "dir");
  const plan = previewReview({ ...input, workspacePath: alias }, { snapshot });
  assert.equal(plan.head, git("rev-parse", "HEAD"));
  assert.equal(plan.dispatchAllowed, false);
  const relativePath = path.join(cwd, ".", "nested", "..");
  assert.equal(previewReview({ ...input, workspacePath: relativePath }, { snapshot }).approvalDigest, plan.approvalDigest);
  const nestedLink = path.join(aliasDir, "nested-link");
  fs.symlinkSync(nested, nestedLink, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => previewReview({ ...input, workspacePath: nestedLink }, { snapshot }), /CLEAN_WORKTREE_ROOT_REQUIRED/);
});

test("review handles linked git worktrees, distinct repos, untracked dirtiness, goalId binding, and build-only warning", async t => {
  const { cwd, git, input, snapshot } = fixture(t);
  const linkedParent = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-review-wt-"));
  t.after(() => fs.rmSync(linkedParent, { recursive: true, force: true }));
  const linked = path.join(linkedParent, "wt");
  git("worktree", "add", "-q", "-b", "wt-branch", linked);
  t.after(() => { try { git("worktree", "remove", "--force", linked); } catch {} });
  fs.mkdirSync(path.join(linked, "sub"), { recursive: true });
  fs.writeFileSync(path.join(linked, "sub", "f.txt"), "ok");
  execFileSync("git", ["add", "."], { cwd: linked, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "sub in worktree"], { cwd: linked, stdio: "ignore" });

  const wtPlan = previewReview({ ...input, workspacePath: linked }, { snapshot: () => ({
    unsafe: false, digest: "a".repeat(64),
    binding: { headCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: linked, encoding: "utf8" }).trim(), repositoryId: "repo", workspaceId: "wt" }
  }) });
  assert.throws(() => previewReview({ ...input, workspacePath: path.join(linked, "sub") }, { snapshot }), /CLEAN_WORKTREE_ROOT_REQUIRED/);

  // Distinct repository cannot reuse digest
  const other = fixture(t);
  await assert.rejects(executeReview(other.input, wtPlan.approvalDigest, { snapshot: other.snapshot, runCommand: async () => ({ exitCode: 0 }) }), /REVIEW_SCOPE_CHANGED/);

  // Untracked file marks workspace dirty
  fs.writeFileSync(path.join(cwd, "untracked.tmp"), "dirty");
  assert.throws(() => previewReview(input, { snapshot }), /CLEAN_WORKTREE_ROOT_REQUIRED/);
  fs.rmSync(path.join(cwd, "untracked.tmp"));

  // Build-only review warns and never certifies acceptance; goalId binds digest
  const buildInput = { workspacePath: cwd, goalId: "goal-42", checks: [{ criterionId: "build", command: "npm run build", timeoutMs: 1000 }] };
  const buildPlan = previewReview(buildInput, { snapshot });
  assert.equal(buildPlan.buildOnlyWarning, true);
  assert.equal(buildPlan.goalId, "goal-42");
  await assert.rejects(executeReview({ ...buildInput, goalId: "goal-99" }, buildPlan.approvalDigest, { snapshot, runCommand: async () => assert.fail() }), /REVIEW_SCOPE_CHANGED/);
  const buildReport = await executeReview(buildInput, buildPlan.approvalDigest, { snapshot, runCommand: async () => ({ exitCode: 0 }) });
  assert.equal(buildReport.status, "CHECKS_PASSED");
  assert.equal(buildReport.buildOnlyWarning, true);
  assert.equal(buildReport.acceptanceCertified, false);
  assert.equal(buildReport.results[0].kind, "build");
});
