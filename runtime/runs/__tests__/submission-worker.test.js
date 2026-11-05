"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { processApprovedAdmissionCycle, createPollingSubmissionWorker } = require("../submission-worker");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
async function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-worker-cycle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, "data", "runs.json");
  const store = new JsonFileRunStore({ filePath });
  const second = new JsonFileRunStore({ filePath });
  for (const projectId of ["project-worker-alpha", "project-worker-beta"]) {
    const location = path.join(root, projectId);
    fs.mkdirSync(location);
    await store.createProject({ id: projectId, path: location });
  }
  return { root, store, second };
}
async function admit(store, suffix, { projectId = "project-worker-alpha", manifest = true,
  provider = "opencode", workspace = "workspace-" + suffix } = {}) {
  const fingerprint = hash(workspace);
  let manifestId;
  if (manifest) {
    const stored = await store.putExecutableManifest({
      schemaVersion: 1, projectId, planDigest: hash("plan-" + suffix),
      artifactDigest: hash("artifact-" + suffix), maxCostUSD: 0,
      tasks: [{
        taskId: "task-" + suffix, dependsOn: [], providerId: provider,
        modelId: "default", workspaceFingerprint: fingerprint, headCommit: "a".repeat(40),
        branch: "main", promptDigest: hash("prompt-" + suffix),
        acceptanceDigest: hash("acceptance-" + suffix), sandbox: "none",
        maxAttempts: 1, maxDurationMs: 10000, maxCostUSD: 0
      }]
    });
    manifestId = stored.id;
  }
  const { submission } = await store.admitRunSubmission({
    projectId, clientKey: "client-key-" + suffix,
    planDigest: hash("plan-" + suffix), artifactDigest: hash("artifact-" + suffix),
    workspaceFingerprint: fingerprint, approvalDigest: hash("approval-" + suffix),
    taskCount: 1, providers: [provider], maxAttempts: 1,
    maxDurationMs: 10000, maxCostUSD: 0, ...(manifestId ? { manifestId } : {})
  });
  return submission;
}
function trustedPorts(store, { projectId = "project-worker-alpha", suffix = "alpha", onDispatch } = {}) {
  return {
    store, projectId, workerId: "worker-trusted-" + suffix,
    verifyApproval: async (subject) => {
      assert.equal(subject.projectId, projectId);
      assert.match(subject.requestDigest, /^[a-f0-9]{64}$/);
      assert.match(subject.manifestId, /^manifest-[a-f0-9]{64}$/);
      return true;
    },
    prepareRun: async ({ submission }) => {
      const tag = submission.id.slice(-12);
      const runId = "run-worker-" + tag;
      const taskId = "task-worker-" + tag;
      await store.saveTask({ id: taskId, projectId: submission.projectId, status: "pending" });
      await store.saveRun({ id: runId, taskId, providerId: submission.providers[0], status: "pending" });
      await store.saveStep({ id: "step-" + tag, runId, status: "pending" });
      return { runId };
    },
    dispatchRun: async ({ runId, submission }) => {
      if (onDispatch) await onDispatch({ runId, submission });
      const current = await store.getRun(runId);
      await store.saveRun({ ...current, status: "completed" });
    },
    leaseMs: 30000, heartbeatMs: 1000
  };
}

test("two clients share the persistent ledger; scoped worker dispatches once and cannot cross projects", async (t) => {
  const { store, second } = await setup(t);
  const alpha = await admit(store, "alpha");
  const beta = await admit(second, "beta", { projectId: "project-worker-beta", provider: "agy" });
  let dispatched = 0;
  const ports = trustedPorts(store, { onDispatch: () => { dispatched++; } });
  const cycle = await processApprovedAdmissionCycle(ports);
  assert.equal(cycle.authority, "MAESTRO");
  assert.equal(cycle.processed, 1);
  assert.equal(cycle.actions[0].outcome, "SUPERVISED");
  assert.equal(cycle.actions[0].status, "COMPLETED");
  assert.equal(dispatched, 1);
  assert.equal((await second.getRunSubmission(alpha.id)).status, "COMPLETED");
  assert.equal((await store.getRunSubmission(beta.id)).status, "PENDING_WORKER");
  const replay = await processApprovedAdmissionCycle(ports);
  assert.equal(replay.processed, 0);
  assert.equal(dispatched, 1);

  const betaPorts = trustedPorts(second, {
    projectId: "project-worker-beta", suffix: "beta", onDispatch: () => { dispatched++; }
  });
  const other = await processApprovedAdmissionCycle(betaPorts);
  assert.equal(other.actions[0].status, "COMPLETED");
  assert.equal(dispatched, 2);
});

test("legacy unbound submissions stay pending without approval checks, provider calls or forged Run", async (t) => {
  const { store } = await setup(t);
  const legacy = await admit(store, "legacy", { manifest: false });
  let prepared = 0;
  const ports = trustedPorts(store);
  ports.verifyApproval = async () => { throw new Error("approval should not be consulted"); };
  ports.prepareRun = async () => { prepared++; throw new Error("must not prepare"); };
  const cycle = await processApprovedAdmissionCycle(ports);
  assert.deepEqual(cycle.actions, [{
    submissionId: legacy.id, outcome: "BLOCKED", reason: "EXECUTABLE_MANIFEST_REQUIRED"
  }]);
  assert.equal(prepared, 0);
  assert.equal((await store.getRunSubmission(legacy.id)).status, "PENDING_WORKER");
  assert.deepEqual(await store.listRuns({}), []);
});

test("multi-task DAG never degrades into a single-provider fallback", async (t) => {
  const { store } = await setup(t);
  const projectId = "project-worker-alpha";
  const specs = ["agy", "opencode"].map((providerId, i) => ({
    taskId: "task-multi-" + i,
    dependsOn: i ? ["task-multi-0"] : [],
    providerId, modelId: "default",
    workspaceFingerprint: hash("worktree-" + i),
    headCommit: "b".repeat(40), branch: "main",
    promptDigest: hash("multi-prompt-" + i),
    acceptanceDigest: hash("multi-acceptance-" + i),
    sandbox: "none", maxAttempts: 1, maxDurationMs: 10000, maxCostUSD: 0
  }));
  const manifest = await store.putExecutableManifest({
    schemaVersion: 1, projectId, planDigest: hash("multi-plan"),
    artifactDigest: hash("multi-artifact"), maxCostUSD: 0,
    tasks: specs
  });
  const { submission } = await store.admitRunSubmission({
    projectId, clientKey: "client-multi-dag-001",
    planDigest: manifest.planDigest, artifactDigest: manifest.artifactDigest,
    workspaceFingerprint: hash("worktree-0"), approvalDigest: hash("multi-approval"),
    taskCount: 2, providers: ["agy", "opencode"], maxAttempts: 1,
    maxDurationMs: 10000, maxCostUSD: 0, manifestId: manifest.id
  });
  let effect = 0;
  const ports = trustedPorts(store, { onDispatch: () => { effect++; } });
  ports.verifyApproval = async () => { throw new Error("must not enter provider approval"); };
  const report = await processApprovedAdmissionCycle(ports);
  assert.deepEqual(report.actions, [{
    submissionId: submission.id, outcome: "BLOCKED", reason: "MULTI_TASK_DISPATCH_UNSUPPORTED"
  }]);
  assert.equal(effect, 0);
  assert.equal((await store.getRunSubmission(submission.id)).status, "PENDING_WORKER");
  assert.deepEqual(await store.listRuns({}), []);
});

test("expired claims are quarantined before dispatch and never automatically replayed", async (t) => {
  const { store } = await setup(t);
  const old = await admit(store, "expired");
  const fresh = await admit(store, "fresh");
  await store.claimRunSubmission(old.id, { workerId: "worker-expired-001", leaseMs: 1000 });
  await store._mutate(async () => {
    const row = store._state.runSubmissions.find((entry) => entry.id === old.id);
    row.leaseExpiresAt = "2000-01-01T00:00:00.000Z";
    await store._flush();
  });
  let dispatched = 0;
  const ports = trustedPorts(store, { onDispatch: () => { dispatched++; } });
  const first = await processApprovedAdmissionCycle(ports);
  assert.deepEqual(first.quarantined, [old.id]);
  assert.equal((await store.getRunSubmission(old.id)).status, "RECONCILIATION_REQUIRED");
  assert.equal((await store.getRunSubmission(fresh.id)).status, "COMPLETED");
  assert.equal(dispatched, 1);
  const again = await processApprovedAdmissionCycle(ports);
  assert.deepEqual(again.quarantined, []);
  assert.equal(again.processed, 0);
  await assert.rejects(store.admitRunSubmission({
    projectId: "project-worker-alpha", clientKey: "client-other-expired",
    planDigest: hash("different-plan"), artifactDigest: hash("different-artifact"),
    workspaceFingerprint: old.workspaceFingerprint, approvalDigest: hash("approval-other"),
    taskCount: 1, providers: ["opencode"], maxAttempts: 1, maxDurationMs: 10000, maxCostUSD: 0
  }), { code: "WORKSPACE_RESERVED" });
});

test("racing worker instances never double-dispatch an admitted Run", async (t) => {
  const { store, second } = await setup(t);
  const pending = await admit(store, "race");
  let dispatched = 0;
  const first = trustedPorts(store, { onDispatch: () => { dispatched++; } });
  const secondPorts = trustedPorts(second, {
    suffix: "second", onDispatch: () => { dispatched++; }
  });
  const [a, b] = await Promise.all([
    processApprovedAdmissionCycle(first), processApprovedAdmissionCycle(secondPorts)
  ]);
  assert.equal(dispatched, 1);
  assert.equal((await second.getRunSubmission(pending.id)).status, "COMPLETED");
  assert.equal([...a.actions, ...b.actions].filter((item) => item.outcome === "SUPERVISED").length, 1);
  assert.ok(
    [...a.actions, ...b.actions].every((item) =>
      item.outcome === "SUPERVISED" || item.outcome === "CONCURRENT_CHANGE"),
  );
});

test("uncertain provider effects are never replayed on subsequent cycles", async (t) => {
  const { store } = await setup(t);
  const submission = await admit(store, "uncertain");
  let invoked = 0;
  const ports = trustedPorts(store, { onDispatch: () => {
    invoked++;
    throw new Error("connection failed after remote side effects");
  } });
  const failed = await processApprovedAdmissionCycle(ports);
  assert.equal(failed.actions[0].outcome, "BLOCKED");
  assert.equal(failed.actions[0].reason, "WORKER_OPERATION_FAILED");
  assert.equal((await store.getRunSubmission(submission.id)).status, "DISPATCHED");
  const next = await processApprovedAdmissionCycle(ports);
  assert.equal(next.processed, 0);
  assert.equal(invoked, 1);
});

test("poller is opt-in, rejects missing trusted ports and does not overlap cycles", async (t) => {
  const { store } = await setup(t);
  await admit(store, "polling");
  const worker = createPollingSubmissionWorker({ ...trustedPorts(store), pollIntervalMs: 1000 });
  assert.equal(worker.running, false);
  const [first, second] = await Promise.all([worker.runOnce(), worker.runOnce()]);
  assert.equal(first.actions[0].status, "COMPLETED");
  assert.deepEqual(second, first);
  assert.equal(worker.start(), true);
  assert.equal(worker.start(), false);
  assert.equal(await worker.stop(), true);
  assert.equal(worker.running, false);
  assert.equal(await worker.stop(), false);
  assert.throws(() => createPollingSubmissionWorker({
    store, projectId: "project-worker-alpha", workerId: "worker-bad-001"
  }), { code: "SUBMISSION_WORKER_UNAVAILABLE" });
});
