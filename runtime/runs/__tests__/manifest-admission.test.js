"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { bindingFromRealGitWorktree } = require("../workspace-authority");
const { admitManifestBoundSubmission } = require("../manifest-admission");

const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

async function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bound-manifest-"));
  t.after(() => fs.rmSync(tmp, { force: true, recursive: true }));
  const root = path.join(tmp, "source");
  fs.mkdirSync(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(root, "README.md"), "safe\n");
  git(root, "add", "README.md");
  git(root, "commit", "-qm", "baseline");
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  const projectId = "project-manifest-001";
  await store.createProject({ id: projectId, path: root });
  const binding = bindingFromRealGitWorktree({ projectRoot: root, workspacePath: root });
  const input = {
    schemaVersion: 1, projectId, planDigest: hash("plan"),
    artifactDigest: hash("artifact"), maxCostUSD: 2,
    tasks: [{
      taskId: "task-one", dependsOn: [], providerId: "opencode",
      modelId: "default", workspaceFingerprint: binding.fingerprint,
      headCommit: binding.headCommit, branch: binding.branch,
      promptDigest: hash("prompt"), acceptanceDigest: hash("acceptance"),
      sandbox: "none", maxAttempts: 1, maxDurationMs: 3000, maxCostUSD: 2
    }]
  };
  const manifest = await store.putExecutableManifest(input);
  return { root, tmp, store, manifest, input };
}
function request(f, extra = {}) {
  return {
    store: f.store, projectRoot: f.root, workspacePath: f.root,
    manifestId: f.manifest.id, clientKey: "client-bound-001",
    approvalDigest: hash("verified-human-receipt"),
    verifyApproval: async () => true,
    ...extra
  };
}

test("manifest-bound admission binds the stored model, plan and provider without caller overrides", async (t) => {
  const f = await fixture(t);
  let proof;
  const accepted = await admitManifestBoundSubmission(request(f, {
    verifyApproval: async (subject) => {
      proof = subject;
      return true;
    }
  }));
  assert.equal(accepted.replayed, false);
  assert.equal(accepted.submission.manifestId, f.manifest.id);
  assert.equal(accepted.submission.planDigest, f.manifest.planDigest);
  assert.deepEqual(accepted.submission.providers, ["opencode"]);
  assert.equal(proof.manifestDigest, f.manifest.digest);
  assert.equal(proof.executableTasks[0].promptDigest, hash("prompt"));
  assert.equal((await admitManifestBoundSubmission(request(f))).replayed, true);
  assert.equal((await f.store.listRunSubmissions()).length, 1);
});

test("unverified approval, unknown manifest and changed provider binding fail before ledger side effects", async (t) => {
  const f = await fixture(t);
  await assert.rejects(admitManifestBoundSubmission(request(f, {
    verifyApproval: async () => ({ approved: true })
  })), { code: "APPROVAL_NOT_VERIFIED" });
  await assert.rejects(admitManifestBoundSubmission(request(f, {
    manifestId: "manifest-" + hash("forged")
  })), { code: "EXECUTABLE_MANIFEST_NOT_FOUND" });
  const second = await f.store.putExecutableManifest({
    ...f.input, planDigest: hash("changed-plan"),
    tasks: [{ ...f.input.tasks[0], workspaceFingerprint: hash("another-worktree") }]
  });
  await assert.rejects(admitManifestBoundSubmission(request(f, {
    manifestId: second.id
  })), { code: "MANIFEST_MULTI_WORKTREE_UNSUPPORTED" });
  assert.equal((await f.store.listRunSubmissions()).length, 0);
});

test("HEAD changes during human approval do not reserve the workspace", async (t) => {
  const f = await fixture(t);
  await assert.rejects(admitManifestBoundSubmission(request(f, {
    verifyApproval: async () => {
      fs.writeFileSync(path.join(f.root, "README.md"), "changed after human review\n");
      git(f.root, "add", "README.md");
      git(f.root, "commit", "-qm", "changed before admission");
      return true;
    }
  })), { code: "WORKSPACE_CHANGED_DURING_APPROVAL" });
  assert.equal((await f.store.listRunSubmissions()).length, 0);
});
