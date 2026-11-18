"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBridge } = require("../../bridge");

test("Bridge does not advertise executable runs.submit before persistent worker exists", async () => {
  let providerCalls = 0;
  const bridge = createBridge({
    projectRoot: process.cwd(),
    services: {
      runtime: {
        executeRun: async () => { providerCalls++; throw new Error("must never execute"); }
      }
    }
  });
  const init = await bridge.handle({
    jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1 }
  });
  assert.equal(init.result.capabilities.runsSubmit, false);
  const submitted = await bridge.handle({
    jsonrpc: "2.0", id: 2, method: "runs.submit",
    params: {
      clientKey: "flow-request-0001", approved: true,
      providerId: "agy", description: "Do not execute"
    }
  });
  assert.equal(submitted.error?.code, -32601);
  assert.equal(providerCalls, 0);
});

test("Bridge advertises runs.submit only with the full durable submission contract", async () => {
  const calls = [];
  const canonicalStore = {
    putExecutableManifest: async () => { throw new Error("not exercised here"); },
    saveApprovalReceipt: async () => { throw new Error("not exercised here"); },
    saveTask: async () => { throw new Error("not exercised here"); },
    getExecutableManifest: async () => null
  };
  const wired = createBridge({
    projectRoot: process.cwd(),
    services: {
      worker: { workerId: "worker-fixture-001", step: async () => ({ claimed: 0, outcomes: [] }) },
      runStore: canonicalStore,
      runtime: { providers: { get: () => null } }
    }
  });
  const init = await wired.handle({
    jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1 }
  });
  assert.equal(init.result.capabilities.runsSubmit, true);
  // Without the worker service the same store must NOT advertise submission.
  const unwired = createBridge({
    projectRoot: process.cwd(),
    services: { runStore: canonicalStore, runtime: { providers: { get: () => null } } }
  });
  const unwiredInit = await unwired.handle({
    jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1 }
  });
  assert.equal(unwiredInit.result.capabilities.runsSubmit, false);
  const blocked = await unwired.handle({
    jsonrpc: "2.0", id: 2, method: "runs.submit", params: {}
  });
  assert.equal(blocked.error?.code, -32601);
  assert.deepEqual(calls, []);
});
