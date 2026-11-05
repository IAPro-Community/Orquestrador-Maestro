"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { capabilities } = require("../../core");
const { MaestroApplication, ProviderRegistry } = require("../../application/maestro-application");
const { JsonFileRunStore } = require("../../store");
const { bindingFromRealGitWorktree } = require("../workspace-authority");
const { admitManifestBoundSubmission } = require("../manifest-admission");
const { superviseSubmissionOnce } = require("../submission-supervisor");
const { createApplicationSubmissionPorts } = require("../application-submission-ports");
const { processApprovedAdmissionCycle } = require("../submission-worker");

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
class FakeOpenCode {
  constructor() { this.id = "opencode"; this.calls = 0; }
  async detect() { return { id: this.id, installed: true, executable: "fake-opencode" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute() {
    this.calls++;
    return {
      pid: 10, cancel() {},
      result: Promise.resolve({
        providerId: this.id, pid: 10, exitCode: 0,
        stdout: "verified", stderr: "", durationMs: 1,
        cancelled: false, timedOut: false
      })
    };
  }
}
async function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-executable-once-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projectRoot = path.join(tmp, "project");
  fs.mkdirSync(projectRoot);
  git(projectRoot, "init", "-q");
  git(projectRoot, "config", "user.name", "Fixture");
  git(projectRoot, "config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(projectRoot, "README.md"), "base\n");
  git(projectRoot, "add", "README.md");
  git(projectRoot, "commit", "-qm", "base");
  const projectId = "project-executable-001";
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.createProject({ id: projectId, path: projectRoot });
  const provider = new FakeOpenCode();
  const app = new MaestroApplication({
    projectRoot, store, providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  const binding = bindingFromRealGitWorktree({ projectRoot, workspacePath: projectRoot });
  const description = "Verify the existing README without changing files.";
  const acceptanceText = "README exists and changes are validated by the reviewer.";
  const manifest = await store.putExecutableManifest({
    schemaVersion: 1, projectId, planDigest: hash("plan"), artifactDigest: hash("artifact"),
    maxCostUSD: 0, tasks: [{
      taskId: "task-executable-001", dependsOn: [], providerId: provider.id,
      modelId: "default", workspaceFingerprint: binding.fingerprint,
      headCommit: binding.headCommit, branch: binding.branch,
      promptDigest: hash(description), acceptanceDigest: hash(acceptanceText),
      sandbox: "none", maxAttempts: 1, maxDurationMs: 5000, maxCostUSD: 0
    }]
  });
  const approved = async () => true;
  const admitted = await admitManifestBoundSubmission({
    store, projectRoot, workspacePath: projectRoot, manifestId: manifest.id,
    clientKey: "client-executable-001", approvalDigest: hash("approved-receipt"),
    verifyApproval: approved
  });
  return { store, app, provider, projectRoot, manifest, submission: admitted.submission,
    description, acceptanceText, approved };
}
test("trusted MaestroApplication executes manifest-bound Run exactly once through supervisor", async (t) => {
  const f = await fixture(t);
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const result = await superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-executable-001", ...ports
  });
  assert.equal(result.submission.status, "COMPLETED");
  assert.equal(result.dispatched, true);
  assert.equal((await f.store.getRun(result.runId)).status, "completed");
  assert.equal(f.provider.calls, 1);
  await assert.rejects(superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-executable-002", ...ports
  }), { code: "SUBMISSION_NOT_CLAIMABLE" });
  assert.equal(f.provider.calls, 1);
});
test("forged artifact content never calls provider or records dispatch", async (t) => {
  const f = await fixture(t);
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: "tampered prompt", acceptanceText: f.acceptanceText
    })
  });
  await assert.rejects(superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-executable-003", ...ports
  }), { code: "EXECUTABLE_ARTIFACT_MISMATCH" });
  assert.equal(f.provider.calls, 0);
  assert.equal((await f.store.getRunSubmission(f.submission.id)).status, "CLAIMED");
});
test("Git HEAD changes before prepared dispatch block side effects", async (t) => {
  const f = await fixture(t);
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const prepared = await ports.prepareRun({
    submission: f.submission, signal: new AbortController().signal
  });
  fs.writeFileSync(path.join(f.projectRoot, "README.md"), "changed\n");
  git(f.projectRoot, "add", "README.md");
  git(f.projectRoot, "commit", "-qm", "different head");
  await assert.rejects(ports.dispatchRun({
    submission: f.submission, runId: prepared.runId,
    signal: new AbortController().signal
  }), { code: "MANIFEST_WORKSPACE_CHANGED" });
  assert.equal(f.provider.calls, 0);
});

test("trusted Maestro worker executes one manifest-bound application Run and second client sees the receipt", async (t) => {
  const f = await fixture(t);
  const otherClient = new JsonFileRunStore({ filePath: f.store.filePath });
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const worker = {
    ...ports,
    store: f.store, projectId: f.manifest.projectId,
    projectRoot: f.projectRoot, workerId: "worker-application-real-001",
    leaseMs: 30000, heartbeatMs: 1000
  };
  const first = await processApprovedAdmissionCycle(worker);
  assert.equal(first.authority, "MAESTRO");
  assert.equal(first.actions.length, 1);
  assert.equal(first.actions[0].outcome, "SUPERVISED");
  assert.equal(first.actions[0].status, "COMPLETED");
  assert.equal(first.actions[0].runId.startsWith("run-"), true);
  assert.equal((await otherClient.getRunSubmission(f.submission.id)).status, "COMPLETED");
  assert.equal((await otherClient.getRun(first.actions[0].runId)).status, "completed");
  assert.equal(f.provider.calls, 1);
  const repeated = await processApprovedAdmissionCycle({ ...worker, store: otherClient });
  assert.equal(repeated.processed, 0);
  assert.equal(f.provider.calls, 1);
});

test("worker does not call application provider if a manifest-bound approval was revoked", async (t) => {
  const f = await fixture(t);
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot,
    verifyApproval: async () => false,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const attempt = await processApprovedAdmissionCycle({
    ...ports, store: f.store, projectId: f.manifest.projectId,
    projectRoot: f.projectRoot, workerId: "worker-revoked-app-001"
  });
  assert.deepEqual(attempt.actions, [{
    submissionId: f.submission.id, outcome: "BLOCKED", reason: "APPROVAL_NOT_VERIFIED"
  }]);
  assert.equal(f.provider.calls, 0);
  assert.equal((await f.store.getRunSubmission(f.submission.id)).status, "PENDING_WORKER");
  assert.deepEqual(await f.store.listRuns({}), []);
});
