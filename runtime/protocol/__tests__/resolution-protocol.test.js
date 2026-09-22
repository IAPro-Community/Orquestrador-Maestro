"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createProtocolV2Server } = require("../protocol-v2");

async function action(server, type, payload) {
  const [response] = await server.handleLine(JSON.stringify({ kind: "action", requestId: `req-${type}`, type, payload }));
  return response;
}

test("protocol v2 routes resolution, evidence and proof through the runtime", async () => {
  const runtime = {
    store: { listEvents: async () => [] },
    executeTaskWithHandoff: async (payload) => ({ run: { id: "run-1" }, received: payload }),
    inspectRun: async (runId) => ({ run: { id: runId }, resolution: { state: "validated" } }),
    listEvidence: async () => [{ id: "e1" }],
    getEvidence: async (id) => ({ id }),
    getTaskProofBundle: async (id) => ({ kind: "task-proof-bundle", id }),
    getMissionProofBundle: async (id) => ({ kind: "mission-proof-bundle", id })
  };
  const server = createProtocolV2Server({ runtime, store: runtime.store });

  assert.equal((await action(server, "run.execute", { description: "fix", providerFallbacks: ["claude"] })).result.run.id, "run-1");
  assert.equal((await action(server, "resolution.get", { runId: "run-1" })).result.state, "validated");
  assert.equal((await action(server, "evidence.list", { taskId: "task-1" })).result[0].id, "e1");
  assert.equal((await action(server, "evidence.get", { evidenceId: "e1" })).result.id, "e1");
  assert.equal((await action(server, "proof.task", { taskId: "task-1" })).result.kind, "task-proof-bundle");
  assert.equal((await action(server, "proof.mission", { missionId: "mission-1" })).result.kind, "mission-proof-bundle");
  server.close();
});
