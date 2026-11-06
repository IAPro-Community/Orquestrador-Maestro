"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBridge } = require("../bridge");
const { JsonFileRunStore } = require("../../store");

const request = (method, params = {}) => ({ jsonrpc: "2.0", id: 1, method, params });
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("poll pages deterministically, hides private data and never includes foreign projects", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-poll-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const rows = [
    { id: "submission-bbbb", projectId: "project-poll-001", status: "CLAIMED",
      taskCount: 1, providers: ["agy"], workerId: "PRIVATE_WORKER" },
    { id: "submission-aaaa", projectId: "project-poll-001", status: "PENDING_WORKER",
      taskCount: 1, providers: ["opencode"] },
    { id: "submission-cccc", projectId: "project-poll-001", status: "DISPATCHED",
      taskCount: 1, providers: ["codex"], runId: "run-cccc" },
    { id: "submission-foreign", projectId: "project-foreign", status: "COMPLETED",
      taskCount: 1, providers: ["claude"] }
  ];
  const store = {
    listProjects: async () => [{ id: "project-poll-001", path: root }],
    listRunSubmissions: async () => rows, // Does not honor project filter.
    getRunSubmission: async (id) => rows.find((row) => row.id === id)
  };
  const bridge = createBridge({ projectRoot: root, services: { runStore: store } });
  assert.equal((await bridge.handle(request("initialize"))).result.capabilities.runsSubmissionsPoll, true);
  const poll = async (params = {}) => (await bridge.handle(request("runs.submissions.poll", params))).result;
  const first = await poll({ limit: 2 });
  assert.equal(first.delivery, "SNAPSHOT_POLL");
  assert.equal(first.replayable, false);
  assert.equal(first.changed, true);
  assert.equal(first.total, 3);
  assert.equal(first.nextOffset, 2);
  assert.deepEqual(first.submissions.map((row) => row.submissionId), ["submission-aaaa", "submission-bbbb"]);
  assert.ok(!JSON.stringify(first).includes("PRIVATE_WORKER"));
  const unchanged = await poll({ limit: 2, cursor: first.cursor });
  assert.equal(unchanged.changed, false);
  assert.deepEqual(unchanged.submissions, []);
  const lastPage = await poll({ limit: 2, offset: 2, cursor: first.cursor });
  assert.equal(lastPage.changed, true, "a cursor from another page cannot suppress results");
  assert.equal(lastPage.nextOffset, null);
  assert.deepEqual(lastPage.submissions.map((row) => row.submissionId), ["submission-cccc"]);
  rows[0].status = "CANCEL_REQUESTED";
  const changed = await poll({ limit: 2, cursor: first.cursor });
  assert.equal(changed.changed, true);
  assert.equal(changed.submissions[1].status, "CANCEL_REQUESTED");
  rows[3].status = "FAILED";
  assert.equal((await poll({ limit: 2, cursor: changed.cursor })).changed, false);
  for (const params of [
    { cursor: "s1:invalid" }, { cursor: "a".repeat(64) },
    { offset: -1 }, { offset: 1.5 }, { limit: 101 },
    { projectId: "project-foreign" }
  ]) {
    assert.equal((await bridge.handle(request("runs.submissions.poll", params))).error.code, -32602);
  }
});

test("poll stays stable across two real RunStores, cancellation and restart", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-poll-restart-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const filePath = path.join(root, "state.json");
  const a = new JsonFileRunStore({ filePath });
  const b = new JsonFileRunStore({ filePath });
  const projectId = "project-poll-restart";
  await a.createProject({ id: projectId, path: root });
  const admission = (await a.admitRunSubmission({
    projectId, clientKey: "client-poll-restart",
    planDigest: digest("plan"), artifactDigest: digest("artifact"),
    workspaceFingerprint: digest("workspace"), approvalDigest: digest("approval"),
    taskCount: 1, providers: ["opencode"], maxAttempts: 1,
    maxDurationMs: 10000, maxCostUSD: 0
  })).submission;
  const firstBridge = createBridge({ projectRoot: root, services: { runStore: a } });
  const secondBridge = createBridge({ projectRoot: root, services: { runStore: b } });
  const first = (await firstBridge.handle(request("runs.submissions.poll"))).result;
  assert.equal(first.total, 1);
  assert.equal((await secondBridge.handle(request("runs.submissions.poll", {
    cursor: first.cursor
  }))).result.changed, false);
  assert.equal((await secondBridge.handle(request("runs.submissions.cancel", {
    submissionId: admission.id
  }))).result.status, "CANCELLED");
  const changed = (await firstBridge.handle(request("runs.submissions.poll", {
    cursor: first.cursor
  }))).result;
  assert.equal(changed.changed, true);
  assert.equal(changed.submissions[0].status, "CANCELLED");
  const restartedBridge = createBridge({ projectRoot: root, services: {
    runStore: new JsonFileRunStore({ filePath })
  } });
  assert.equal((await restartedBridge.handle(request("runs.submissions.poll", {
    cursor: changed.cursor
  }))).result.changed, false);
});
