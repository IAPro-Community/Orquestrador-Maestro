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

const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
class FakeOpenCode {
  constructor() { this.id = "opencode"; this.calls = 0; }
  async detect() { return { id: this.id, installed: true, executable: "fake-opencode" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute(request) {
    this.calls++;
    this.lastRequest = request;
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
async function fixture(t, { testScript, providerId = "opencode", sandbox = "none" } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-executable-once-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projectRoot = path.join(tmp, "project");
  fs.mkdirSync(projectRoot);
  git(projectRoot, "init", "-q");
  git(projectRoot, "config", "user.name", "Fixture");
  git(projectRoot, "config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(projectRoot, "README.md"), "base\n");
  if (testScript) fs.writeFileSync(path.join(projectRoot, "package.json"),
    JSON.stringify({ private: true, scripts: { test: testScript } }));
  git(projectRoot, "add", ".");
  git(projectRoot, "commit", "-qm", "base");
  const projectId = "project-executable-001";
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.createProject({ id: projectId, path: projectRoot });
  const provider = new FakeOpenCode();
  provider.id = providerId;
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
      sandbox, maxAttempts: 1, maxDurationMs: 5000, maxCostUSD: 0
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

test("supervisor cancellation reaches the real application port and provider exactly once", async (t) => {
  const f = await fixture(t);
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  let finishProvider;
  let cancels = 0;
  f.provider.execute = async () => {
    f.provider.calls++;
    const result = new Promise((resolve) => { finishProvider = resolve; });
    resolveStarted();
    return {
      pid: 10,
      cancel() {
        cancels++;
        finishProvider({
          providerId: f.provider.id, pid: 10, exitCode: 130,
          stdout: "", stderr: "", durationMs: 1,
          cancelled: true, timedOut: false
        });
      },
      result
    };
  };
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const supervision = superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-cancel-e2e-01", leaseMs: 2000, heartbeatMs: 200,
    ...ports
  });
  await started;
  const requested = await f.store.requestRunSubmissionCancellation(f.submission.id);
  assert.equal(requested.status, "CANCEL_REQUESTED");
  const settled = await supervision;
  assert.equal(f.provider.calls, 1);
  assert.equal(cancels, 1);
  assert.equal(settled.submission.status, "CANCELLED");
  assert.equal((await f.store.getRun(settled.runId)).status, "cancelled");
});

test("Git HEAD changed by adding verification script requires new approval", async (t) => {
  const f = await fixture(t);
  // This package.json is an approved project file at dispatch time, not a
  // provider-authored command. The checker is inferred from the allowlist.
  fs.writeFileSync(path.join(f.projectRoot, "package.json"), JSON.stringify({
    private: true, scripts: { test: "node -e \"process.exit(1)\"" }
  }));
  git(f.projectRoot, "add", "package.json");
  git(f.projectRoot, "commit", "-qm", "add failing project check");
  // The immutable manifest is bound to the earlier HEAD; first prove that
  // drift cannot dispatch. A fresh admission is needed for a changed HEAD.
  const stalePorts = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  await assert.rejects(stalePorts.prepareRun({
    submission: f.submission, signal: new AbortController().signal
  }), { code: "MANIFEST_WORKSPACE_CHANGED" });
  assert.equal(f.provider.calls, 0);
});

test("provider exit code zero still runs an inferred failing test command", async (t) => {
  const f = await fixture(t, { testScript: 'node -e "process.exit(1)"' });
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const result = await superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-failed-verification-001", ...ports
  });
  const run = await f.store.getRun(result.runId);
  const verification = await f.app.getVerification(result.runId);
  assert.equal(f.provider.calls, 1);
  assert.equal(run.status, "failed");
  assert.equal(result.submission.status, "FAILED");
  assert.equal(verification.status, "failed");
  assert.ok(verification.checks.some((check) => check.exitCode !== 0));
  // Submission status is execution bookkeeping; this failed verification
  // must never be represented as a validated goal.
  assert.notEqual(run.metadata?.resolution?.outcome?.state, "validated");
});


test("agent cannot replace the approved npm test script with a vacuous passing check", async (t) => {
  const f = await fixture(t, { testScript: 'node -e "process.exit(1)"' });
  f.provider.execute = async () => {
    f.provider.calls++;
    fs.writeFileSync(path.join(f.projectRoot, "package.json"),
      JSON.stringify({ private: true, scripts: { test: 'node -e "process.exit(0)"' } }));
    return {
      pid: 10, cancel() {},
      result: Promise.resolve({
        providerId: "opencode", pid: 10, exitCode: 0, stdout: "done",
        stderr: "", durationMs: 1, cancelled: false, timedOut: false
      })
    };
  };
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const result = await superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-verifier-tamper-001", ...ports
  });
  const run = await f.store.getRun(result.runId);
  const verification = await f.app.getVerification(result.runId);
  assert.equal(f.provider.calls, 1);
  assert.equal(verification.status, "skipped", "tampered verifier must never execute");
  assert.equal(verification.checks.length, 0);
  assert.equal(run.status, "failed", "a tampered verifier must block acceptance");
  assert.equal(result.submission.status, "FAILED");
  assert.ok(run.metadata.qualityFindings.some((finding) =>
    finding.code === "VERIFICATION_CONFIG_DRIFT" && finding.blocking === true));
  assert.notEqual(run.metadata.resolution?.outcome?.state, "validated");
});


test("agent cannot replace an indirect local test script while leaving package.json unchanged", async (t) => {
  const f = await fixture(t, { testScript: "node scripts/check.cjs" });
  const localVerifier = path.join(f.projectRoot, "scripts", "check.cjs");
  fs.mkdirSync(path.dirname(localVerifier), { recursive: true });
  fs.writeFileSync(localVerifier, "process.exit(1);\n");
  f.provider.execute = async () => {
    f.provider.calls++;
    fs.writeFileSync(localVerifier, "process.exit(0);\n");
    return {
      pid: 10, cancel() {},
      result: Promise.resolve({
        providerId: "opencode", pid: 10, exitCode: 0, stdout: "done",
        stderr: "", durationMs: 1, cancelled: false, timedOut: false
      })
    };
  };
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const result = await superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-indirect-verifier-001", ...ports
  });
  const run = await f.store.getRun(result.runId);
  const verification = await f.app.getVerification(result.runId);
  assert.equal(f.provider.calls, 1);
  assert.equal(verification.status, "skipped", "substituted verifier must never execute");
  assert.equal(verification.checks.length, 0);
  assert.equal(run.status, "failed", "changing verifier inputs must block acceptance");
  assert.equal(result.submission.status, "FAILED");
  assert.ok(run.metadata.qualityFindings.some((finding) =>
    finding.code === "VERIFICATION_CONFIG_DRIFT" && finding.blocking));
  assert.notEqual(run.metadata.resolution?.outcome?.state, "validated");
});

test("agent cannot introduce a new verifier config during durable execution", async (t) => {
  const f = await fixture(t, { testScript: 'node -e "process.exit(0)"' });
  f.provider.execute = async () => {
    f.provider.calls++;
    fs.writeFileSync(path.join(f.projectRoot, "vitest.config.ts"), "export default {};\n");
    return {
      pid: 10, cancel() {},
      result: Promise.resolve({
        providerId: "opencode", pid: 10, exitCode: 0, stdout: "done",
        stderr: "", durationMs: 1, cancelled: false, timedOut: false
      })
    };
  };
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: f.approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const result = await superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-new-verifier-001", ...ports
  });
  const run = await f.store.getRun(result.runId);
  assert.equal(result.submission.status, "FAILED");
  assert.ok(run.metadata.qualityFindings.some((finding) =>
    finding.code === "VERIFICATION_CONFIG_DRIFT" && finding.blocking));
});


test("manifest approval revoked during preparation cannot dispatch provider", async (t) => {
  const f = await fixture(t);
  let approved = true;
  const ports = createApplicationSubmissionPorts({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workspacePath: f.projectRoot, verifyApproval: async () => approved,
    resolveApprovedTask: async () => ({
      description: f.description, acceptanceText: f.acceptanceText
    })
  });
  const result = await superviseSubmissionOnce({
    store: f.store, submissionId: f.submission.id,
    workerId: "worker-revoked-manifest-001", ...ports,
    prepareRun: async (args) => {
      const prepared = await ports.prepareRun(args);
      approved = false;
      return prepared;
    }
  });
  assert.equal(result.submission.status, "CANCELLED");
  assert.equal(result.dispatched, false);
  assert.equal(f.provider.calls, 0);
});

test("durable dispatch forwards approved sandbox, model and timeout, and uses scoped task ID", async t => {
  const f = await fixture(t,{providerId:"codex",sandbox:"read-only"});
  const ports = createApplicationSubmissionPorts({
    application:f.app,store:f.store,projectRoot:f.projectRoot,workspacePath:f.projectRoot,
    verifyApproval:f.approved,resolveApprovedTask:async()=>({description:f.description,acceptanceText:f.acceptanceText})
  });
  const result=await superviseSubmissionOnce({store:f.store,submissionId:f.submission.id,workerId:"worker-binding-test",...ports});
  assert.equal(f.provider.lastRequest.sandbox,"read-only");
  assert.equal(f.provider.lastRequest.model,"default");
  assert.equal(f.provider.lastRequest.timeoutMs,5000);
  const run=await f.store.getRun(result.runId);
  assert.notEqual(run.taskId,f.manifest.tasks[0].taskId);
  assert.equal(run.metadata.semanticTaskId,f.manifest.tasks[0].taskId);
  assert.equal(run.metadata.durableSubmissionId,f.submission.id);
});
