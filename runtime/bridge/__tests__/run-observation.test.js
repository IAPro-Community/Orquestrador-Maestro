"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBridge } = require("../index");

const call = (bridge, method, params) =>
  bridge.handle({ jsonrpc: "2.0", id: 1, method, params });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-observe-"));
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "foreign-observe-"));
  const secret = "EXFILTRATE_TOKEN_123456";
  const events = [
    { id: "ev-1", runId: "run-1", type: "run.started", occurredAt: "2026-11-02T10:00:00Z", data: { secret } },
    { id: "ev-2", runId: "run-1", type: "provider.output", occurredAt: "2026-11-02T10:00:01Z", data: { raw: secret } },
    { id: "ev-3", runId: "run-1", type: "run.completed", occurredAt: "2026-11-02T10:00:02Z", data: { secret } }
  ];
  const runtime = {
    async inspectRun(id) {
      if (id !== "run-1") return null;
      return {
        run: { id, taskId: "task-1", providerId: "agy", status: "completed", metadata: { private: secret } },
        task: { id: "task-1", projectId: "project-1" },
        project: { id: "project-1", path: root },
        events
      };
    }
  };
  return {
    root, foreign, runtime, events, secret,
    close() {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(foreign, { recursive: true, force: true });
    }
  };
}

test("runs.observe replays only bounded, sanitized durable lifecycle events", async () => {
  const f = fixture();
  try {
    const bridge = createBridge({ projectRoot: f.root, services: { runtime: f.runtime } });
    const init = await call(bridge, "initialize", { protocolVersion: 1 });
    assert.equal(init.result.capabilities.runsObserve, true);
    const first = await call(bridge, "runs.observe", { runId: "run-1", limit: 1 });
    assert.equal(first.error, undefined);
    assert.equal(first.result.authority, "MAESTRO");
    assert.equal(first.result.executionOwner, "MAESTRO");
    assert.equal(first.result.providerId, "agy");
    assert.equal(first.result.liveOutputAvailable, false);
    assert.equal(first.result.events.length, 1);
    assert.equal(first.result.events[0].id, "ev-1");
    assert.equal(first.result.hasMore, true);
    const second = await call(bridge, "runs.observe", {
      runId: "run-1", afterEventId: first.result.nextCursor, limit: 2
    });
    assert.deepEqual(second.result.events.map(e => e.id), ["ev-3"]);
    assert.equal(second.result.hasMore, false);
    assert.equal(second.result.nextCursor, "ev-3");
    assert.equal(JSON.stringify([first, second]).includes(f.secret), false);
    assert.equal(JSON.stringify([first, second]).includes("provider.output"), false);
  } finally { f.close(); }
});

test("runs.observe denies foreign projects and conceals existence", async () => {
  const f = fixture();
  try {
    const bridge = createBridge({ projectRoot: f.foreign, services: { runtime: f.runtime } });
    const r = await call(bridge, "runs.observe", { runId: "run-1" });
    assert.equal(r.result, null);
    assert.equal(r.error, undefined);
    const missing = await call(bridge, "runs.observe", { runId: "run-404" });
    assert.equal(missing.result, null);
  } finally { f.close(); }
});

test("runs.observe rejects forged cursors, unbounded params and unsupported runtime", async () => {
  const f = fixture();
  try {
    const bridge = createBridge({ projectRoot: f.root, services: { runtime: f.runtime } });
    for (const params of [
      { runId: "../foreign" }, { runId: "run-1", limit: 101 },
      { runId: "run-1", limit: 0 }, { runId: "run-1", afterEventId: "missing" },
      { runId: "run-1", projectPath: f.foreign }
    ]) {
      const result = await call(bridge, "runs.observe", params);
      assert.equal(result.error?.code, -32602, JSON.stringify(params));
    }
    const empty = createBridge({ projectRoot: f.root });
    const capability = await call(empty, "initialize", { protocolVersion: 1 });
    assert.equal(capability.result.capabilities.runsObserve, false);
    const response = await call(empty, "runs.observe", { runId: "run-1" });
    assert.equal(response.error?.code, -32601);
  } finally { f.close(); }
});
