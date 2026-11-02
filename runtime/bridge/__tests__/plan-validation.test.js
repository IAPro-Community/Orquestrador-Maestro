"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createBridge } = require("../index");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-plan-validation-"));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Architecture\nMaestro is the canonical authority.\n");
  const content = "Implement a bounded API with a tested client";
  const artifact = {
    id: "composer.artifact-1",
    version: 1,
    content,
    sha256: crypto.createHash("sha256").update(content, "utf8").digest("hex")
  };
  const proposal = {
    tasks: [
      {
        id: "backend", title: "Implement API validation",
        objective: "Add bounded validation for the public API",
        acceptanceCriteria: ["Invalid input returns a typed error"],
        requiredCapabilities: ["backend"], dependsOn: []
      },
      {
        id: "client", title: "Integrate the validated client",
        objective: "Consume the bounded API and show errors",
        acceptanceCriteria: ["Client handles errors without retries"],
        requiredCapabilities: ["frontend"], dependsOn: ["backend"]
      }
    ]
  };
  return { root, artifact, proposal };
}
function rpc(method, params, id = 2) {
  return { jsonrpc: "2.0", id, method, params };
}

test("plans.validate reuses Maestro DAG validator without execution or writes", async () => {
  const { root, artifact, proposal } = fixture();
  try {
    const bridge = createBridge({
      projectRoot: root,
      services: {
        runtime: {
          executeRun: () => { throw Error("must never execute"); },
          createMission: () => { throw Error("must never persist"); }
        }
      }
    });
    const init = await bridge.handle(rpc("initialize", { protocolVersion: 1 }, 1));
    assert.equal(init.result.capabilities.plansValidate, true);
    const response = await bridge.handle(rpc("plans.validate", { projectPath: root, artifact, proposal }));
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    assert.equal(response.result.authority, "MAESTRO");
    assert.equal(response.result.schemaVersion, 1);
    assert.equal(response.result.source, "caller-provided-proposal");
    assert.equal(response.result.reviewOnly, true);
    assert.equal(response.result.executable, false);
    assert.equal(response.result.requiresApproval, true);
    assert.equal(response.result.validation.valid, true);
    assert.equal(response.result.tasks.length, 2);
    assert.deepEqual(response.result.tasks[1].dependsOn, ["backend"]);
    assert.equal(response.result.artifact.sha256, artifact.sha256);
    assert.match(response.result.context.contentDigest, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(response.result), /Implement a bounded API with a tested client/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plans.validate rejects bad lineage and cross-project scope before planning", async () => {
  const { root, artifact, proposal } = fixture();
  try {
    const bridge = createBridge({ projectRoot: root });
    const bad = [
      { projectPath: path.dirname(root), artifact, proposal },
      { artifact: { ...artifact, sha256: "0".repeat(64) }, proposal },
      { artifact: { ...artifact, version: 0 }, proposal },
      { artifact: { ...artifact, id: "../unsafe" }, proposal },
      { artifact, proposal: { tasks: [] } },
      { artifact, proposal: { tasks: Array.from({ length: 33 }, () => proposal.tasks[0]) } },
      { artifact, proposal: { tasks: [{ ...proposal.tasks[0], acceptanceCriteria: [] }] } }
    ];
    for (const params of bad) {
      const response = await bridge.handle(rpc("plans.validate", params));
      assert.equal(response.error?.code, -32602, JSON.stringify(params).slice(0,200));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("plans.validate fails closed on cyclic, generic, and dependency-invalid graphs", async () => {
  const { root, artifact, proposal } = fixture();
  try {
    const bridge = createBridge({ projectRoot: root });
    const graphs = [
      { tasks: [{ ...proposal.tasks[0], title: "IMPLEMENT" }] },
      { tasks: [{ ...proposal.tasks[0], dependsOn: ["missing"] }] },
      { tasks: [
        { ...proposal.tasks[0], dependsOn: ["client"] },
        { ...proposal.tasks[1], dependsOn: ["backend"] }
      ] }
    ];
    for (const plan of graphs) {
      const response = await bridge.handle(rpc("plans.validate", { artifact, proposal: plan }));
      assert.equal(response.error, undefined, JSON.stringify(response.error));
      assert.equal(response.result.validation.valid, false);
      assert.ok(response.result.validation.blockers.length > 0);
      assert.equal(response.result.tasks, null);
      assert.equal(response.result.executable, false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
