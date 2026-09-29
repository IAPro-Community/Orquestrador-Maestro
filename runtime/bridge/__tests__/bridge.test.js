"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBridge, PROTOCOL_VERSION } = require("../index");

test("bridge v1 initializes over the stable stdio contract", async () => {
  const bridge = createBridge({ projectRoot: process.cwd() });
  const response = await bridge.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: PROTOCOL_VERSION }
  });

  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.id, 1);
  assert.equal(response.result.protocolVersion, PROTOCOL_VERSION);
  assert.equal(response.result.serverInfo.name, "maestro-bridge");
});

test("bridge v1 rejects removed cli-novo surfaces", async () => {
  const bridge = createBridge({ projectRoot: process.cwd() });
  for (const method of ["projects.dashboard", "terminals.create", "agentSessions.create", "panes.list"]) {
    const response = await bridge.handle({ jsonrpc: "2.0", id: method, method, params: {} });
    assert.equal(response.error.code, -32601);
  }
});
