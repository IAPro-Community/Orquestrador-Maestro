"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createBridge } = require("../bridge");
const { JsonFileRunStore } = require("../../store");

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

test("Bridge never scopes a different directory on the same filesystem as the current project", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-cross-root-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const current = path.join(tmp, "current");
  const foreign = path.join(tmp, "foreign");
  fs.mkdirSync(current);
  fs.mkdirSync(foreign);
  const store = {
    listProjects: async () => [{ id: "project-foreign-001", path: foreign }],
    listRunSubmissions: async () => [{ id: "foreign", projectId: "project-foreign-001" }],
    getRunSubmission: async () => ({ id: "foreign", projectId: "project-foreign-001" })
  };
  const bridge = createBridge({ projectRoot: current, services: { runStore: store } });
  const denied = await bridge.handle(request("runs.submissions.list"));
  assert.equal(denied.error.code, -32602);
});

test("Bridge cancellation is project-scoped, idempotent and never fabricates worker completion", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-cancel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [
    { id: "submission-queued-001", projectId: "project-bound-001", status: "PENDING_WORKER", taskCount: 1, providers: ["agy"] },
    { id: "submission-active-002", projectId: "project-bound-001", status: "CLAIMED", taskCount: 1, providers: ["opencode"] },
    { id: "submission-foreign-003", projectId: "project-foreign-002", status: "PENDING_WORKER", taskCount: 1, providers: ["codex"] }
  ];
  const requests = [];
  const store = {
    listProjects: async () => [{ id: "project-bound-001", path: root }],
    listRunSubmissions: async () => rows,
    getRunSubmission: async (id) => rows.find((row) => row.id === id),
    requestRunSubmissionCancellation: async (id) => {
      requests.push(id);
      const row = rows.find((item) => item.id === id);
      if (row.status === "PENDING_WORKER") row.status = "CANCELLED";
      else if (row.status === "CLAIMED") row.status = "CANCEL_REQUESTED";
      return { ...row };
    }
  };
  const bridge = createBridge({ projectRoot: root, services: { runStore: store } });
  const init = await bridge.handle(request("initialize"));
  assert.equal(init.result.capabilities.runsSubmissionsCancel, true);
  assert.equal(init.result.capabilities.runsSubmit, false);
  const queued = await bridge.handle(request("runs.submissions.cancel", {
    submissionId: "submission-queued-001"
  }));
  assert.equal(queued.result.status, "CANCELLED");
  const repeat = await bridge.handle(request("runs.submissions.cancel", {
    submissionId: "submission-queued-001"
  }));
  assert.equal(repeat.result.status, "CANCELLED");
  const active = await bridge.handle(request("runs.submissions.cancel", {
    submissionId: "submission-active-002"
  }));
  assert.equal(active.result.status, "CANCEL_REQUESTED");
  const foreign = await bridge.handle(request("runs.submissions.cancel", {
    submissionId: "submission-foreign-003"
  }));
  assert.equal(foreign.result, null);
  assert.deepEqual(requests, [
    "submission-queued-001", "submission-queued-001", "submission-active-002"
  ]);
  const invalid = await bridge.handle(request("runs.submissions.cancel", {
    submissionId: "submission-active-002", projectId: "project-foreign-002"
  }));
  assert.equal(invalid.error.code, -32602);
  assert.equal(rows[2].status, "PENDING_WORKER");
});

test("Bridge projects measured run usage only with real evidence and omits it otherwise", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-usage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [
    { id: "submission-measured-001", projectId: "project-usage-001", status: "COMPLETED",
      runId: "run-measured", taskCount: 1, providers: ["opencode"] },
    { id: "submission-unmeasured-002", projectId: "project-usage-001", status: "FAILED",
      runId: "run-unmeasured", taskCount: 1, providers: ["opencode"] },
    { id: "submission-estimated-003", projectId: "project-usage-001", status: "COMPLETED",
      runId: "run-estimated", taskCount: 1, providers: ["opencode"] },
    { id: "submission-partial-004", projectId: "project-usage-001", status: "COMPLETED",
      runId: "run-partial", taskCount: 1, providers: ["opencode"] },
    { id: "submission-no-run-005", projectId: "project-usage-001", status: "PENDING_WORKER",
      runId: null, taskCount: 1, providers: ["opencode"] }
  ];
  const runs = [
    {
      id: "run-measured",
      metadata: {
        cognitiveTelemetry: {
          tokenSource: "provider-reported", usageComplete: true,
          tokenInput: 500, tokenOutput: 120,
          cachedInputTokens: 200, cachedOutputTokens: 8, reasoningTokens: 42,
          durationMs: 2500
        }
      }
    },
    // No telemetry at all: legacy/older runs.
    { id: "run-unmeasured", metadata: { resolution: { outcome: "failed" } } },
    // Estimated tokens are NOT measured evidence: usage must be omitted.
    {
      id: "run-estimated",
      metadata: {
        cognitiveTelemetry: {
          tokenSource: "estimated", tokenInput: 999, tokenOutput: 999, durationMs: 10
        }
      }
    },
    // Partial measurement: measured fields survive, unmeasured stay null (never 0).
    {
      id: "run-partial",
      metadata: {
        cognitiveTelemetry: {
          tokenSource: "provider-reported", usageComplete: false,
          tokenInput: null, tokenOutput: 77, cachedInputTokens: null,
          reasoningTokens: null, durationMs: -1
        }
      }
    }
  ];
  const store = {
    listProjects: async () => [{ id: "project-usage-001", path: root }],
    listRunSubmissions: async () => rows,
    getRunSubmission: async (id) => rows.find((row) => row.id === id),
    getRun: async (id) => runs.find((run) => run.id === id) || null
  };
  const bridge = createBridge({ projectRoot: root, services: { runStore: store } });
  await bridge.handle(request("initialize"));
  const detail = async (submissionId) =>
    (await bridge.handle(request("runs.submissions.get", { submissionId }))).result;

  const measured = await detail("submission-measured-001");
  assert.deepEqual(measured.usage, {
    schemaVersion: 1,
    evidence: "RUN_STORE_OBSERVED",
    tokensInput: 500, tokensOutput: 120, tokensCached: 200,
    tokensReasoning: 42, durationMs: 2500
  });
  assert.deepEqual(Object.keys(measured.usage),
    ["schemaVersion", "evidence", "tokensInput", "tokensOutput", "tokensCached", "tokensReasoning", "durationMs"]);

  // No measured usage: the usage field is omitted entirely (legacy shape).
  for (const submissionId of [
    "submission-unmeasured-002", "submission-estimated-003", "submission-no-run-005"
  ]) {
    assert.equal("usage" in (await detail(submissionId)), false,
      submissionId + " must not carry a usage field without measured evidence");
  }

  // Partial run: only measured fields present; unmeasured fields stay null.
  const partial = await detail("submission-partial-004");
  assert.deepEqual(partial.usage, {
    schemaVersion: 1, evidence: "RUN_STORE_OBSERVED",
    tokensInput: null, tokensOutput: 77, tokensCached: null,
    tokensReasoning: null, durationMs: null
  });

  // The same projections hold in list and poll surfaces.
  const list = (await bridge.handle(request("runs.submissions.list", { limit: 10 }))).result;
  const listed = list.submissions.find((row) => row.submissionId === "submission-measured-001");
  assert.deepEqual(listed.usage, measured.usage);
  assert.equal("usage" in list.submissions.find((row) => row.submissionId === "submission-estimated-003"), false);
  const poll = (await bridge.handle(request("runs.submissions.poll", { limit: 10 }))).result;
  const polled = poll.submissions.find((row) => row.submissionId === "submission-measured-001");
  assert.deepEqual(polled.usage, measured.usage);
});

test("usage projection is fail-closed without getRun and poll cursors change when usage appears", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-usage-cursor-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [
    { id: "submission-usage-001", projectId: "project-cursor-001", status: "COMPLETED",
      runId: "run-usage", taskCount: 1, providers: ["agy"] }
  ];
  const run = {
    id: "run-usage",
    metadata: {
      cognitiveTelemetry: {
        tokenSource: "provider-reported", usageComplete: true,
        tokenInput: 320, tokenOutput: 64, cachedInputTokens: null,
        reasoningTokens: null, durationMs: 900
      }
    }
  };
  const listProjects = async () => [{ id: "project-cursor-001", path: root }];
  const listRunSubmissions = async () => rows;
  // Legacy adapter without getRun: no usage, no error.
  const legacyBridge = createBridge({ projectRoot: root, services: {
    runStore: { listProjects, listRunSubmissions, getRunSubmission: async () => rows[0] }
  } });
  await legacyBridge.handle(request("initialize"));
  const legacy = (await legacyBridge.handle(request("runs.submissions.poll", { limit: 5 }))).result;
  assert.equal("usage" in legacy.submissions[0], false);

  // getRun that fails must also fail closed, without breaking the projection.
  const failingBridge = createBridge({ projectRoot: root, services: {
    runStore: {
      listProjects, listRunSubmissions, getRunSubmission: async () => rows[0],
      getRun: async () => { throw new Error("store unavailable"); }
    }
  } });
  await failingBridge.handle(request("initialize"));
  const failing = (await failingBridge.handle(request("runs.submissions.get", {
    submissionId: "submission-usage-001"
  }))).result;
  assert.equal("usage" in failing, false);
  assert.equal(failing.submissionId, "submission-usage-001");

  // Adapter with getRun: usage appears and the cursor differs from the
  // legacy projection, so old cursors observe changed=true.
  const bridge = createBridge({ projectRoot: root, services: {
    runStore: { listProjects, listRunSubmissions, getRunSubmission: async () => rows[0], getRun: async () => run }
  } });
  await bridge.handle(request("initialize"));
  const first = (await bridge.handle(request("runs.submissions.poll", { limit: 5 }))).result;
  assert.deepEqual(first.submissions[0].usage, {
    schemaVersion: 1, evidence: "RUN_STORE_OBSERVED",
    tokensInput: 320, tokensOutput: 64, tokensCached: null,
    tokensReasoning: null, durationMs: 900
  });
  assert.notEqual(first.cursor, legacy.cursor);
  assert.equal((await bridge.handle(request("runs.submissions.poll", {
    limit: 5, cursor: first.cursor
  }))).result.changed, false, "two polls of the same state must share one cursor");
  const withOldCursor = (await bridge.handle(request("runs.submissions.poll", {
    limit: 5, cursor: legacy.cursor
  }))).result;
  assert.equal(withOldCursor.changed, true, "a pre-usage cursor must observe the change");
  assert.equal("usage" in withOldCursor.submissions[0], true);
});

test("Bridge does not advertise cancellation without a trusted durable RunStore mutation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-cancel-denied-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = {
    listProjects: async () => [{ id: "project-bound-001", path: root }],
    listRunSubmissions: async () => [],
    getRunSubmission: async () => null
  };
  const bridge = createBridge({ projectRoot: root, services: { runStore: store } });
  const init = await bridge.handle(request("initialize"));
  assert.equal(init.result.capabilities.runsSubmissionsCancel, false);
  const denied = await bridge.handle(request("runs.submissions.cancel", {
    submissionId: "submission-queued-001"
  }));
  assert.equal(denied.error.code, -32602);
});

test("two Bridge clients sharing one real RunStore see durable scoped cancellation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-two-clients-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const leftRoot = path.join(root, "client-a");
  const rightRoot = path.join(root, "client-b");
  fs.mkdirSync(leftRoot);
  fs.mkdirSync(rightRoot);
  const filePath = path.join(root, "state", "runs.json");
  const left = new JsonFileRunStore({ filePath });
  const right = new JsonFileRunStore({ filePath });
  await left.createProject({ id: "project-client-a", path: leftRoot });
  await right.createProject({ id: "project-client-b", path: rightRoot });
  const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const admission = (id, provider) => ({
    projectId: id,
    clientKey: "client-" + id,
    planDigest: digest("plan-" + id),
    artifactDigest: digest("artifact-" + id),
    workspaceFingerprint: digest("workspace-" + id),
    approvalDigest: digest("approval-" + id),
    taskCount: 1,
    providers: [provider],
    maxAttempts: 1,
    maxDurationMs: 10000,
    maxCostUSD: 0
  });
  const first = (await left.admitRunSubmission(admission("project-client-a", "agy"))).submission;
  const second = (await right.admitRunSubmission(admission("project-client-b", "opencode"))).submission;
  const clientA = createBridge({ projectRoot: leftRoot, services: { runStore: left } });
  const clientB = createBridge({ projectRoot: rightRoot, services: { runStore: right } });
  assert.equal((await clientA.handle(request("runs.submissions.get", {
    submissionId: second.id
  }))).result, null);
  assert.equal((await clientB.handle(request("runs.submissions.cancel", {
    submissionId: first.id
  }))).result, null);
  assert.equal((await clientA.handle(request("runs.submissions.cancel", {
    submissionId: first.id
  }))).result.status, "CANCELLED");
  assert.equal((await right.getRunSubmission(first.id)).status, "CANCELLED");
  assert.equal((await clientA.handle(request("runs.submissions.cancel", {
    submissionId: first.id
  }))).result.status, "CANCELLED");
  assert.equal((await left.getRunSubmission(second.id)).status, "PENDING_WORKER");
  await right.claimRunSubmission(second.id, { workerId: "worker-client-b-0001" });
  assert.equal((await clientB.handle(request("runs.submissions.cancel", {
    submissionId: second.id
  }))).result.status, "CANCEL_REQUESTED");
  assert.equal((await left.getRunSubmission(second.id)).status, "CANCEL_REQUESTED");
});
