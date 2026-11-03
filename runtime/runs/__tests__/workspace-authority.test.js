"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { bindingFromRealGitWorktree, admitCanonicalWorktreeSubmission } = require("../workspace-authority");
const sha = (x) => crypto.createHash("sha256").update(x).digest("hex");
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}
function init(root) {
  fs.mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "example@example.invalid");
  git(root, "config", "user.name", "fixture");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-qm", "initial");
}
function spec(patch = {}) {
  return {
    projectId: "project-authority-001", clientKey: "request-authority-001",
    planDigest: sha("plan"), artifactDigest: sha("artifact"),
    approvalDigest: sha("receipt"), taskCount: 1, providers: ["opencode"],
    maxAttempts: 1, maxDurationMs: 10000, maxCostUSD: 0, ...patch
  };
}
test("authoritative worktree binding rejects forged identity and foreign repository", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-authority-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, "root"), foreign = path.join(tmp, "foreign");
  init(root); init(foreign);
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.createProject({ id: "project-authority-001", path: root });
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, projectRoot: root, workspacePath: root, input: spec()
  }), { code: "APPROVAL_NOT_VERIFIED" });
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, projectRoot: root, workspacePath: root, input: spec(),
    verifyApproval: async () => ({ approved: true })
  }), { code: "APPROVAL_NOT_VERIFIED" });
  assert.equal((await store.listRunSubmissions()).length, 0);
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, projectRoot: root, workspacePath: root, input: spec(),
    verifyApproval: async () => {
      fs.writeFileSync(path.join(root, "README.md"), "changed while verifying\n");
      git(root, "add", "README.md");
      git(root, "commit", "-qm", "concurrent head change");
      return true;
    }
  }), { code: "WORKSPACE_CHANGED_DURING_APPROVAL" });
  assert.equal((await store.listRunSubmissions()).length, 0);
  const binding = bindingFromRealGitWorktree({ projectRoot: root, workspacePath: root });
  assert.match(binding.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(binding.fingerprint, bindingFromRealGitWorktree({
    projectRoot: path.join(root, "."), workspacePath: path.join(root, ".")
  }).fingerprint);
  const first = await admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: root, input: spec()
  });
  assert.equal(first.submission.workspaceFingerprint, binding.fingerprint);
  assert.equal((await admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: root, input: spec()
  })).replayed, true);
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: root,
    input: spec({ clientKey: "another-key-001", workspaceFingerprint: sha("invented") })
  }), { code: "WORKSPACE_FINGERPRINT_MISMATCH" });
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: foreign, input: spec({ clientKey: "foreign-key-001" })
  }), { code: "INVALID_WORKSPACE_AUTHORITY" });
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: root, input: spec({ clientKey: "replay-conflict-001" })
  }), { code: "WORKSPACE_RESERVED" });
});

test("independent worktrees get distinct reservations; detached or unregistered roots are rejected", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-worktree-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, "root"), secondary = path.join(tmp, "secondary");
  init(root);
  git(root, "worktree", "add", "-b", "feature-test", secondary);
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: root, input: spec()
  }), { code: "PROJECT_SCOPE_MISMATCH" });
  await store.createProject({ id: "project-authority-001", path: root });
  const first = await admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: root, input: spec()
  });
  const second = await admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: secondary,
    input: spec({ clientKey: "different-worktree-key-001", planDigest: sha("second") })
  });
  assert.notEqual(first.binding.fingerprint, second.binding.fingerprint);
  assert.equal((await store.listRunSubmissions()).length, 2);
  git(secondary, "checkout", "-q", "--detach", "HEAD");
  await assert.rejects(admitCanonicalWorktreeSubmission({
    store, verifyApproval: async () => true, projectRoot: root, workspacePath: secondary,
    input: spec({ clientKey: "detached-key-001" })
  }), { code: "INVALID_WORKSPACE_AUTHORITY" });
  assert.equal((await store.listRunSubmissions()).length, 2);
});
