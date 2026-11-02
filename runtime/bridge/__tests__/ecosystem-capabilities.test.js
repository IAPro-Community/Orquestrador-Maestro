"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createBridge } = require("../index");

test("all ecosystem Bridge capabilities coexist without enabling memory writes or dispatch", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-ecosystem-"));
  const counters = { dispatched: 0, inspected: 0 };
  const registry = {
    get(id) { return id === "codex" ? {
      id, detect: async () => ({ installed: false }),
      execute: async () => { counters.dispatched++; throw Error("unexpected dispatch"); }
    } : null; }
  };
  const runtime = {
    providers: registry,
    async inspectRun() { counters.inspected++; return null; },
    async executeRun() { counters.dispatched++; throw Error("unexpected dispatch"); }
  };
  try {
    const bridge = createBridge({
      projectRoot: root,
      services: { runtime, providerRegistry: registry }
    });
    const init = await bridge.handle({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: 1 }
    });
    assert.equal(init.error, undefined);
    assert.equal(init.result.capabilities.projectContext, true);
    assert.equal(init.result.capabilities.contextBrief, true);
    assert.equal(init.result.capabilities.plansValidate, true);
    assert.equal(init.result.capabilities.projectCompose, true);
    assert.equal(init.result.capabilities.plansRoutePreview, true);
    assert.equal(init.result.capabilities.runsObserve, true);
    assert.deepEqual(init.result.capabilities.memory, {
      version: 1, read: true, write: false, scoped: true
    });

    const disabledWriter = await bridge.handle({
      jsonrpc: "2.0", id: 2, method: "memory.record",
      params: { confirmed: true }
    });
    assert.equal(disabledWriter.error?.code, -32601);
    const missingRun = await bridge.handle({
      jsonrpc: "2.0", id: 3, method: "runs.observe",
      params: { runId: "run-not-present" }
    });
    assert.equal(missingRun.result, null);
    assert.equal(counters.dispatched, 0);
    assert.equal(counters.inspected, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
