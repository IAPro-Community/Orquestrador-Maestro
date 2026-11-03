"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { JsonFileRunStore } = require("../../store");

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
function spec(overrides = {}) {
  return {
    projectId: "project-sample",
    clientKey: "flow-request-0001",
    planDigest: digest("plan-v1"),
    artifactDigest: digest("artifact-v1"),
    workspaceFingerprint: digest("canonical-workspace-1"),
    approvalDigest: digest("approved-plan-revision-1"),
    taskCount: 2,
    providers: ["agy", "opencode"],
    maxAttempts: 2,
    maxDurationMs: 60000,
    maxCostUSD: 2,
    ...overrides
  };
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-admission-"));
  return {
    filePath: path.join(root, "runtime", "runs.json"),
    close: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

test("admission is atomic, replayable and immutable across fresh Store instances", async (t) => {
  const f = fixture(); t.after(f.close);
  const a = new JsonFileRunStore({ filePath: f.filePath });
  const b = new JsonFileRunStore({ filePath: f.filePath });
  const [first, second] = await Promise.all([a.admitRunSubmission(spec()), b.admitRunSubmission(spec())]);
  assert.equal(first.submission.id, second.submission.id);
  assert.equal([first.replayed, second.replayed].filter(Boolean).length, 1);
  assert.equal((await a.listRunSubmissions({ projectId: "project-sample" })).length, 1);
  assert.equal((await b.getRunSubmission(first.submission.id)).status, "PENDING_WORKER");
  await assert.rejects(b.admitRunSubmission(spec({ artifactDigest: digest("changed") })), {
    code: "RUN_SUBMISSION_CONFLICT"
  });
  await assert.rejects(b.admitRunSubmission(spec({
    clientKey: "flow-request-0002"
  })), { code: "WORKSPACE_RESERVED" });
  const row = await b.getRunSubmission(first.submission.id);
  row.providers.push("codex");
  assert.deepEqual((await b.getRunSubmission(first.submission.id)).providers, ["agy", "opencode"]);
  const copy = new JsonFileRunStore({ filePath: f.filePath });
  assert.equal((await copy.getRunSubmission(first.submission.id)).requestDigest, first.submission.requestDigest);
  assert.doesNotMatch(fs.readFileSync(f.filePath, "utf8"), /api_key|rawPrompt|providerOutput/u);
});

test("admission refuses forged receipt, cross-task provider count and unbounded budgets", async (t) => {
  const f = fixture(); t.after(f.close);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  for (const bad of [
    spec({ approvalDigest: "" }),
    spec({ clientKey: "../unsafe" }),
    spec({ taskCount: 3 }),
    spec({ providers: ["agy", "unknown"] }),
    spec({ maxCostUSD: NaN }),
    spec({ maxCostUSD: 101 }),
    spec({ maxDurationMs: 0 }),
    spec({ maxAttempts: 9 })
  ]) {
    await assert.rejects(store.admitRunSubmission(bad), { code: "INVALID_SUBMISSION" });
  }
  assert.equal((await store.listRunSubmissions()).length, 0);
});

test("worker lease is fenced: claim, dispatch, cancellation and confirmation", async (t) => {
  const f = fixture(); t.after(f.close);
  const worker = "worker-instance-0001";
  const store = new JsonFileRunStore({ filePath: f.filePath });
  const admission = (await store.admitRunSubmission(spec())).submission;
  const claimed = await store.claimRunSubmission(admission.id, { workerId: worker, leaseMs: 10000 });
  assert.equal(claimed.fence, 1);
  assert.equal(claimed.status, "CLAIMED");
  await assert.rejects(store.claimRunSubmission(admission.id, { workerId: "worker-instance-0002" }), {
    code: "SUBMISSION_NOT_CLAIMABLE"
  });
  await assert.rejects(store.markRunSubmissionDispatched(admission.id, {
    workerId: worker, fence: 2, runId: "run-maestro-0001"
  }), { code: "STALE_SUBMISSION_FENCE" });
  await assert.rejects(store.markRunSubmissionDispatched(admission.id, {
    workerId: worker, fence: 1, runId: "run-maestro-0001"
  }), { code: "RUN_PROVENANCE_MISMATCH" });
  await store.createProject({ id: "project-sample", path: "/fixture/path" });
  await store.saveTask({ id: "task-maestro-0001", projectId: "project-sample", description: "API task" });
  await store.saveRun({ id: "run-maestro-0001", taskId: "task-maestro-0001", providerId: "agy", status: "pending" });
  const dispatched = await store.markRunSubmissionDispatched(admission.id, {
    workerId: worker, fence: 1, runId: "run-maestro-0001"
  });
  assert.equal(dispatched.status, "DISPATCHED");
  assert.equal(dispatched.runId, "run-maestro-0001");
  const cancelling = await store.requestRunSubmissionCancellation(admission.id);
  assert.equal(cancelling.status, "CANCEL_REQUESTED");
  await assert.rejects(store.finishRunSubmission(admission.id, {
    workerId: worker, fence: 1, status: "COMPLETED"
  }), { code: "RUN_PROVENANCE_MISMATCH" });
  await assert.rejects(store.finishRunSubmission(admission.id, {
    workerId: worker, fence: 1, status: "CANCELLED"
  }), { code: "RUN_PROVENANCE_MISMATCH" });
  await store.saveRun({ id: "run-maestro-0001", taskId: "task-maestro-0001", providerId: "agy", status: "cancelled" });
  const cancelled = await store.finishRunSubmission(admission.id, {
    workerId: worker, fence: 1, status: "CANCELLED"
  });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.workerId, null);
  await assert.rejects(store.renewRunSubmissionLease(admission.id, {
    workerId: worker, fence: 1
  }), { code: "STALE_SUBMISSION_FENCE" });
  const next = await store.admitRunSubmission(spec({
    clientKey: "flow-request-0002",
    planDigest: digest("another-plan")
  }));
  assert.equal(next.submission.status, "PENDING_WORKER");
  const busyDifferentProject = await store.admitRunSubmission(spec({
    projectId: "project-separate", clientKey: "flow-request-0003",
    workspaceFingerprint: digest("worktree-2"), planDigest: digest("project-plan")
  }));
  assert.equal(busyDifferentProject.submission.status, "PENDING_WORKER");
  await assert.rejects(store.admitRunSubmission(spec({
    projectId: "project-spoofed", clientKey: "flow-request-0004",
    planDigest: digest("attempt-overlap")
  })), { code: "WORKSPACE_RESERVED" });
});

test("pending cancellation has no worker side effects; expired claim is quarantined without retry", async (t) => {
  const f = fixture(); t.after(f.close);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  const pending = (await store.admitRunSubmission(spec())).submission;
  const cancelled = await store.requestRunSubmissionCancellation(pending.id);
  assert.equal(cancelled.status, "CANCELLED");
  await assert.rejects(store.claimRunSubmission(pending.id, { workerId: "worker-instance-0001" }), {
    code: "SUBMISSION_NOT_CLAIMABLE"
  });
  const next = (await store.admitRunSubmission(spec({
    clientKey: "flow-request-0002",
    planDigest: digest("plan-v2")
  }))).submission;
  const claimed = await store.claimRunSubmission(next.id, { workerId: "worker-instance-0001", leaseMs: 1000 });
  await assert.rejects(store.quarantineExpiredRunSubmission(next.id), {
    code: "SUBMISSION_LEASE_ACTIVE"
  });
  // Force a past durable lease in this test only; never replay unknown work.
  await store._mutate(async () => {
    const row = store._state.runSubmissions.find((item) => item.id === next.id);
    row.leaseExpiresAt = "2000-01-01T00:00:00.000Z";
    await store._flush();
  });
  await assert.rejects(store.renewRunSubmissionLease(next.id, {
    workerId: "worker-instance-0001", fence: claimed.fence
  }), { code: "STALE_SUBMISSION_FENCE" });
  assert.equal((await store.quarantineExpiredRunSubmission(next.id)).status, "RECONCILIATION_REQUIRED");
  assert.equal((await new JsonFileRunStore({ filePath: f.filePath }).getRunSubmission(next.id)).status, "RECONCILIATION_REQUIRED");
  await assert.rejects(store.admitRunSubmission(spec({
    clientKey: "flow-request-0003",
    planDigest: digest("plan-v3")
  })), { code: "WORKSPACE_RESERVED" });
});

test("worker can confirm cancellation before dispatch without inventing a Run", async (t) => {
  const f = fixture(); t.after(f.close);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  const admission = (await store.admitRunSubmission(spec())).submission;
  const claimed = await store.claimRunSubmission(admission.id, {
    workerId: "worker-instance-0001"
  });
  assert.equal((await store.requestRunSubmissionCancellation(admission.id)).status, "CANCEL_REQUESTED");
  const outcome = await store.finishRunSubmission(admission.id, {
    workerId: "worker-instance-0001", fence: claimed.fence, status: "CANCELLED"
  });
  assert.equal(outcome.status, "CANCELLED");
  assert.equal(outcome.runId, null);
  assert.deepEqual(await store.listRuns({}), []);
});

test("late cancellation cannot forge provider stop after persisted completion", async (t) => {
  const f = fixture(); t.after(f.close);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  const submission = (await store.admitRunSubmission(spec())).submission;
  const claimed = await store.claimRunSubmission(submission.id, { workerId: "worker-instance-0001" });
  await store.saveTask({ id: "task-late-cancel", projectId: "project-sample", description: "Test API" });
  await store.saveRun({ id: "run-late-cancel", taskId: "task-late-cancel", providerId: "agy", status: "pending" });
  await store.markRunSubmissionDispatched(submission.id, {
    workerId: "worker-instance-0001", fence: claimed.fence, runId: "run-late-cancel"
  });
  await store.saveRun({ id: "run-late-cancel", taskId: "task-late-cancel", providerId: "agy", status: "completed" });
  assert.equal((await store.requestRunSubmissionCancellation(submission.id)).status, "CANCEL_REQUESTED");
  await assert.rejects(store.finishRunSubmission(submission.id, {
    workerId: "worker-instance-0001", fence: claimed.fence, status: "CANCELLED"
  }), { code: "RUN_PROVENANCE_MISMATCH" });
  const outcome = await store.finishRunSubmission(submission.id, {
    workerId: "worker-instance-0001", fence: claimed.fence, status: "COMPLETED"
  });
  assert.equal(outcome.status, "COMPLETED");
});

test("blocked and timed-out Maestro Runs remain distinct terminal states", async (t) => {
  const f = fixture(); t.after(f.close);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  await store.saveTask({ id: "task-blocked-01", projectId: "project-sample", description: "Check approval" });
  const first = (await store.admitRunSubmission(spec())).submission;
  const claimed = await store.claimRunSubmission(first.id, { workerId: "worker-instance-0001" });
  await store.saveRun({ id: "run-blocked-01", taskId: "task-blocked-01", providerId: "agy", status: "pending" });
  await store.markRunSubmissionDispatched(first.id, {
    workerId: "worker-instance-0001", fence: claimed.fence, runId: "run-blocked-01"
  });
  await store.saveRun({ id: "run-blocked-01", taskId: "task-blocked-01", providerId: "agy", status: "blocked" });
  assert.equal((await store.finishRunSubmission(first.id, {
    workerId: "worker-instance-0001", fence: claimed.fence, status: "BLOCKED"
  })).status, "BLOCKED");

  const second = (await store.admitRunSubmission(spec({
    clientKey: "flow-request-0002", planDigest: digest("timeout-plan")
  }))).submission;
  const claimed2 = await store.claimRunSubmission(second.id, { workerId: "worker-instance-0002" });
  await store.saveRun({ id: "run-timeout-0001", taskId: "task-blocked-01", providerId: "opencode", status: "pending" });
  await store.markRunSubmissionDispatched(second.id, {
    workerId: "worker-instance-0002", fence: claimed2.fence, runId: "run-timeout-0001"
  });
  await store.saveRun({ id: "run-timeout-0001", taskId: "task-blocked-01", providerId: "opencode", status: "timed_out" });
  assert.equal((await store.finishRunSubmission(second.id, {
    workerId: "worker-instance-0002", fence: claimed2.fence, status: "TIMED_OUT"
  })).status, "TIMED_OUT");
});

test("invalid persisted admission ledger fails closed instead of deleting queued work", async (t) => {
  const f = fixture(); t.after(f.close);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  await store.admitRunSubmission(spec());
  const baseline = fs.readFileSync(f.filePath, "utf8");
  for (const mutated of [
    (json) => { json.runSubmissions = { erased: true }; },
    (json) => { json.runSubmissions[0].requestDigest = digest("forged-plan"); },
    (json) => { json.runSubmissions.push({ ...json.runSubmissions[0], id: "submission-duplicated" }); },
    (json) => { json.runSubmissions[0].workerId = "worker-forged"; }
  ]) {
    const current = JSON.parse(baseline);
    mutated(current);
    fs.writeFileSync(f.filePath, JSON.stringify(current));
    const reader = new JsonFileRunStore({ filePath: f.filePath });
    await assert.rejects(reader.getRunSubmission("submission-unknown"), { code: "RUN_STORE_CORRUPTED" });
    assert.ok(fs.readFileSync(f.filePath, "utf8").includes("runSubmissions"), "queued work must not be erased on bad read");
  }
  fs.writeFileSync(f.filePath, baseline);
  assert.equal((await new JsonFileRunStore({ filePath: f.filePath }).listRunSubmissions()).length, 1);
});

test("legacy v1 RunStore state without submissions is upgraded without changing existing runs", async (t) => {
  const f = fixture(); t.after(f.close);
  fs.mkdirSync(path.dirname(f.filePath), { recursive: true });
  fs.writeFileSync(f.filePath, JSON.stringify({
    version: 1, projects: [], missions: [], tasks: [], runs: [{ id: "run-original", taskId: "task-0001", status: "completed" }],
    steps: [], executions: [], events: [], artifacts: [], evidence: [], verifications: [],
    terminals: [], projectSnapshots: [], intentSessions: [], missionBriefs: [], taskGraphs: [], attention: []
  }));
  const store = new JsonFileRunStore({ filePath: f.filePath });
  assert.equal((await store.getRun("run-original")).status, "completed");
  await store.admitRunSubmission(spec());
  assert.equal((await store.getRun("run-original")).status, "completed");
  assert.equal((await store.listRunSubmissions()).length, 1);
});

function submitFromChild(filePath, request) {
  const source = `
const { JsonFileRunStore } = require(process.env.STORE_ENTRY);
const spec = JSON.parse(process.env.RUN_REQUEST);
new JsonFileRunStore({ filePath: process.env.RUN_DB }).admitRunSubmission(spec)
.then((result) => process.stdout.write(JSON.stringify(result)))
.catch((error) => { process.stderr.write(error.code || error.message); process.exitCode = 1; });
`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", source], {
      env: {
        ...process.env,
        STORE_ENTRY: path.resolve(__dirname, "../../store"),
        RUN_DB: filePath,
        RUN_REQUEST: JSON.stringify(request)
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let output = "", error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
  });
}

test("independent Maestro processes cannot admit duplicate execution for the same workspace", async (t) => {
  const f = fixture(); t.after(f.close);
  const replies = await Promise.all([submitFromChild(f.filePath, spec()), submitFromChild(f.filePath, spec())]);
  assert.equal(replies[0].submission.id, replies[1].submission.id);
  assert.equal(replies.filter((row) => row.replayed).length, 1);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  assert.equal((await store.listRunSubmissions()).length, 1);
});

test("prepared Run cancellation is bound by fence and cannot affect an unrelated Run", async (t) => {
  const f = fixture(); t.after(f.close);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  const admission = (await store.admitRunSubmission(spec())).submission;
  const claimed = await store.claimRunSubmission(admission.id, {
    workerId: "worker-fenced-0001", leaseMs: 30000
  });
  await store.createProject({ id: "project-sample", path: "/fixture/project" });
  await store.saveTask({ id: "task-fenced-0001", projectId: "project-sample" });
  for (const [runId, stepId] of [
    ["run-unrelated-0001", "step-unrelated-0001"],
    ["run-prepared-0001", "step-prepared-0001"]
  ]) {
    await store.saveRun({
      id: runId, taskId: "task-fenced-0001", providerId: "agy", status: "pending"
    });
    await store.saveStep({ id: stepId, runId, status: "pending" });
  }
  await store.requestRunSubmissionCancellation(admission.id);
  const options = {
    workerId: "worker-fenced-0001", fence: claimed.fence, status: "CANCELLED"
  };
  await assert.rejects(store.finishRunSubmission(admission.id, {
    ...options, preparedRunId: "run-unrelated-0001"
  }), { code: "RUN_PROVENANCE_MISMATCH" });
  assert.equal((await store.getRun("run-unrelated-0001")).status, "pending");

  const bound = await store.bindPreparedRunSubmission(admission.id, {
    workerId: options.workerId, fence: options.fence, runId: "run-prepared-0001"
  });
  assert.equal(bound.preparedRunId, "run-prepared-0001");
  await assert.rejects(store.finishRunSubmission(admission.id, {
    ...options, preparedRunId: "run-unrelated-0001"
  }), { code: "RUN_PROVENANCE_MISMATCH" });
  await assert.rejects(store.bindPreparedRunSubmission(admission.id, {
    workerId: options.workerId, fence: options.fence, runId: "run-unrelated-0001"
  }), { code: "RUN_PROVENANCE_MISMATCH" });

  const result = await store.finishRunSubmission(admission.id, {
    ...options, preparedRunId: "run-prepared-0001"
  });
  assert.equal(result.status, "CANCELLED");
  assert.equal((await store.getRun("run-prepared-0001")).status, "cancelled");
  assert.equal((await store.getStep("step-prepared-0001")).status, "cancelled");
  assert.equal((await store.getRun("run-unrelated-0001")).status, "pending");
  assert.equal((await store.getStep("step-unrelated-0001")).status, "pending");
  const restarted = new JsonFileRunStore({ filePath: f.filePath });
  assert.equal((await restarted.getRunSubmission(admission.id)).preparedRunId, "run-prepared-0001");
});
