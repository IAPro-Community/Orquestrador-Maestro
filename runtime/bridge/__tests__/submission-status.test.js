"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBridge } = require("../bridge");

const request = (method, params = {}) => ({
  jsonrpc: "2.0", id: 1, method, params
});
test("Bridge projects only scoped, bounded, sanitized submission status", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-submissions-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [
    {
      id: "submission-one", projectId: "project-bound-001", status: "CLAIMED",
      runId: null, taskCount: 1, providers: ["opencode"], manifestId: "manifest-a",
      createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T11:00:00Z",
      approvalDigest: "SECRET_APPROVAL_DIGEST",
      workspaceFingerprint: "SECRET_WORKSPACE", workerId: "SECRET_WORKER",
      fence: 999, clientKey: "SECRET_CLIENT", planDigest: "SECRET_PLAN"
    },
    {
      id: "submission-two", projectId: "project-bound-001", status: "DISPATCHED",
      runId: "run-two", taskCount: 1, providers: ["agy"],
      createdAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T12:00:00Z"
    },
    {
      id: "foreign-submission", projectId: "project-foreign-002",
      status: "COMPLETED", runId: "run-foreign", taskCount: 1,
      providers: ["claude"]
    }
  ];
  const store = {
    listProjects: async () => [{ id: "project-bound-001", path: root }],
    listRunSubmissions: async () => rows, // Deliberately ignores filter: Bridge must re-scope.
    getRunSubmission: async (id) => rows.find((row) => row.id === id)
  };
  const bridge = createBridge({ projectRoot: root, services: { runStore: store } });
  const caps = await bridge.handle(request("initialize", { protocolVersion: 1 }));
  assert.equal(caps.result.capabilities.runsSubmissionsRead, true);
  assert.equal(caps.result.capabilities.runsSubmit, false);
  const list = await bridge.handle(request("runs.submissions.list", { limit: 1 }));
  assert.equal(list.result.total, 2);
  assert.equal(list.result.truncated, true);
  assert.equal(list.result.submissions.length, 1);
  assert.equal(list.result.submissions[0].submissionId, "submission-two");
  const detail = await bridge.handle(request("runs.submissions.get", {
    submissionId: "submission-one"
  }));
  assert.equal(detail.result.status, "CLAIMED");
  const encoded = JSON.stringify(detail.result);
  for (const secret of ["SECRET_APPROVAL", "SECRET_WORKSPACE", "SECRET_WORKER", "SECRET_CLIENT", "SECRET_PLAN"]) {
    assert.ok(!encoded.includes(secret), "Bridge leaked " + secret);
  }
  assert.equal((await bridge.handle(request("runs.submissions.get", {
    submissionId: "foreign-submission"
  }))).result, null);
  for (const invalid of [{ projectId: "project-foreign-002" }, { limit: 1000 }]) {
    const denied = await bridge.handle(request("runs.submissions.list", invalid));
    assert.equal(denied.error.code, -32602);
  }
});
test("Bridge refuses ambiguous or unregistered project roots for submission status", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-deny-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = {
    listProjects: async () => [
      { id: "project-one-001", path: root },
      { id: "project-two-002", path: root }
    ],
    listRunSubmissions: async () => [{ id: "s1" }],
    getRunSubmission: async () => ({ id: "s1" })
  };
  const bridge = createBridge({ projectRoot: root, services: { runStore: store } });
  const denied = await bridge.handle(request("runs.submissions.list"));
  assert.equal(denied.error.code, -32602);
});
