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
