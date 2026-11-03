"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { superviseSubmissionOnce } = require("../submission-supervisor");

const digest = (input) => crypto.createHash("sha256").update(input).digest("hex");
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-supervisor-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new JsonFileRunStore({ filePath: path.join(dir, "runs.json") });
  await store.createProject({ id: "project-supervisor-001", path: dir });
  await store.saveTask({
    id: "task-supervisor-001", projectId: "project-supervisor-001", status: "pending"
  });
  const input = {
    projectId: "project-supervisor-001", clientKey: "client-supervisor-001",
    planDigest: digest("plan"), artifactDigest: digest("artifact"),
    workspaceFingerprint: digest(dir), approvalDigest: digest("approval"),
    taskCount: 1, providers: ["opencode"],
    maxAttempts: 1, maxDurationMs: 10000, maxCostUSD: 0
  };
  const { submission } = await store.admitRunSubmission(input);
  return { store, submission };
}
function callbacks(store, count) {
  return {
    verifyApproval: async () => true,
    prepareRun: async () => {
      count.prepare++;
      await store.saveRun({
        id: "run-supervisor-001", taskId: "task-supervisor-001",
        providerId: "opencode", status: "pending"
      });
      return { runId: "run-supervisor-001" };
    },
    dispatchRun: async ({ runId, signal }) => {
      count.dispatch++;
      assert.equal(signal.aborted, false);
      const current = await store.getRun(runId);
      await store.saveRun({ ...current, status: "completed" });
    }
  };
}

test("supervisor fences one approved Run before calling provider and never replays", async (t) => {
  const { store, submission } = await fixture(t);
  const count = { prepare: 0, dispatch: 0 };
  const ops = callbacks(store, count);
  const result = await superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-supervisor-001", ...ops
  });
  assert.equal(result.dispatched, true);
  assert.equal(result.submission.status, "COMPLETED");
  assert.equal(result.runId, "run-supervisor-001");
  assert.deepEqual(count, { prepare: 1, dispatch: 1 });
  assert.equal((await store.getRunSubmission(submission.id)).workerId, null);
  await assert.rejects(superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-supervisor-002", ...ops
  }), { code: "SUBMISSION_NOT_CLAIMABLE" });
  assert.deepEqual(count, { prepare: 1, dispatch: 1 });
});

test("supervisor refuses missing or unverified approval before claiming", async (t) => {
  const { store, submission } = await fixture(t);
  const count = { prepare: 0, dispatch: 0 };
  const ops = callbacks(store, count);
  await assert.rejects(superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-supervisor-003",
    prepareRun: ops.prepareRun, dispatchRun: ops.dispatchRun
  }), { code: "SUBMISSION_SUPERVISOR_UNAVAILABLE" });
  await assert.rejects(superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-supervisor-003",
    ...ops, verifyApproval: async () => ({ approved: true })
  }), { code: "APPROVAL_NOT_VERIFIED" });
  assert.equal((await store.getRunSubmission(submission.id)).status, "PENDING_WORKER");
  assert.deepEqual(count, { prepare: 0, dispatch: 0 });
});

test("cancellation during preparation never dispatches external effects", async (t) => {
  const { store, submission } = await fixture(t);
  let dispatched = 0;
  const result = await superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-supervisor-004",
    verifyApproval: async () => true,
    prepareRun: async () => {
      await store.saveRun({
        id: "run-supervisor-004", taskId: "task-supervisor-001",
        providerId: "opencode", status: "pending"
      });
      await store.requestRunSubmissionCancellation(submission.id);
      return { runId: "run-supervisor-004" };
    },
    dispatchRun: async () => { dispatched++; }
  });
  assert.equal(dispatched, 0);
  assert.equal(result.dispatched, false);
  assert.equal(result.submission.status, "CANCELLED");
  assert.equal((await store.getRunSubmission(submission.id)).runId, null);
});

test("uncertain provider failure stays DISPATCHED and blocks automatic retry", async (t) => {
  const { store, submission } = await fixture(t);
  const count = { prepare: 0, dispatch: 0 };
  const ops = callbacks(store, count);
  await assert.rejects(superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-supervisor-005",
    ...ops, dispatchRun: async () => {
      count.dispatch++;
      throw new Error("provider connection lost after side effects");
    }
  }), /provider connection lost/);
  const uncertain = await store.getRunSubmission(submission.id);
  assert.equal(uncertain.status, "DISPATCHED");
  assert.equal(uncertain.runId, "run-supervisor-001");
  await assert.rejects(superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-supervisor-006", ...ops
  }), { code: "SUBMISSION_NOT_CLAIMABLE" });
  assert.equal(count.dispatch, 1);
});

test("two workers racing for one submission dispatch exactly once", async (t) => {
  const { store, submission } = await fixture(t);
  const competitor = new JsonFileRunStore({ filePath: store.filePath });
  const count = { prepare: 0, dispatch: 0 };
  const ops = callbacks(store, count);
  const a = superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-racing-one", ...ops
  });
  const b = superviseSubmissionOnce({
    store: competitor, submissionId: submission.id, workerId: "worker-racing-two", ...ops
  });
  const results = await Promise.allSettled([a, b]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(results.filter((row) => row.status === "rejected").length, 1);
  assert.equal(count.prepare, 1);
  assert.equal(count.dispatch, 1);
  assert.equal((await store.getRunSubmission(submission.id)).status, "COMPLETED");
});

test("revoked approval during preparation cancels without provider dispatch", async (t) => {
  const { store, submission } = await fixture(t);
  const count = { prepare: 0, dispatch: 0 };
  const ops = callbacks(store, count);
  let checks = 0;
  const result = await superviseSubmissionOnce({
    store, submissionId: submission.id, workerId: "worker-revocation-001",
    ...ops, verifyApproval: async (subject) => {
      assert.equal(subject.projectId, "project-supervisor-001");
      assert.equal(subject.planDigest, digest("plan"));
      assert.equal(Object.hasOwn(subject, "prompt"), false);
      checks++;
      return checks === 1;
    }
  });
  assert.equal(checks, 2);
  assert.equal(result.dispatched, false);
  assert.equal(result.submission.status, "CANCELLED");
  assert.deepEqual(count, { prepare: 1, dispatch: 0 });
});
