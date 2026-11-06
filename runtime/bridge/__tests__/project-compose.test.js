"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createBridge } = require("../index");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-compose-"));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Canonical project\nUse Maestro for composition.\n");
  const content = "Implement a bounded API and validate it with tests";
  const artifact = {
    id: "composer-123", version: 1, approved: true,
    content, sha256: crypto.createHash("sha256").update(content).digest("hex")
  };
  return { root, artifact, close() { fs.rmSync(root, { recursive: true, force: true }); } };
}

function request(bridge, method, params) {
  return bridge.handle({ jsonrpc: "2.0", id: 21, method, params });
}

test("project.compose invokes only explicit read-only Codex and returns a nonexecutable Maestro plan", async () => {
  const f = setup();
  const invocations = [];
  const proposal = {
    tasks: [{
      id: "api", title: "Implement request validation",
      objective: "Reject malformed payloads with typed errors",
      type: "api", dependsOn: [],
      acceptanceCriteria: ["Requests with invalid payloads produce 400"],
      requiredCapabilities: ["backend"]
    }]
  };
  try {
    const bridge = createBridge({
      projectRoot: f.root,
      services: {
        runtime: {
          providers: {
            get(id) {
              if (id !== "codex") throw Error("unexpected provider");
              return {
                async detect() { return { installed: true }; },
                async execute(options) {
                  invocations.push(options);
                  return { result: Promise.resolve({ stdout: JSON.stringify(proposal) }) };
                }
              };
            }
          },
          createMission() { throw Error("must not persist missions"); },
          executeRun() { throw Error("must not execute run"); }
        }
      }
    });
    const init = await request(bridge, "initialize", { protocolVersion: 1 });
    assert.equal(init.result.capabilities.projectCompose, true);
    const r = await request(bridge, "project.compose", {
      projectPath: f.root, artifact: f.artifact,
      providerId: "codex", approvedModelUse: true
    });
    assert.equal(r.error, undefined, JSON.stringify(r.error));
    assert.equal(r.result.authority, "MAESTRO");
    assert.equal(r.result.source, "maestro-semantic-planner");
    assert.equal(r.result.validation.valid, true);
    assert.equal(r.result.tasks.length, 1);
    assert.equal(r.result.tasks[0].id, "api");
    assert.equal(r.result.executable, false);
    assert.equal(r.result.reviewOnly, true);
    assert.equal(r.result.requiresApproval, true);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].sandbox, "read-only");
    assert.equal(invocations[0].timeoutMs, 120000);
    assert.equal(invocations[0].workspacePath, f.root);
  } finally { f.close(); }
});

test("project.compose rejects missing consent, stale digests, other providers and cross-project calls", async () => {
  const f = setup();
  try {
    let executed = false;
    const bridge = createBridge({
      projectRoot: f.root,
      services: {
        runtime: { providers: { get() {
          return { detect: async () => ({ installed: true }), execute: async () => {
            executed = true; throw Error("must not execute");
          } };
        } } }
      }
    });
    const valid = { artifact: f.artifact, providerId: "codex", approvedModelUse: true };
    const malformed = [
      { ...valid, approvedModelUse: false },
      { ...valid, providerId: "opencode" },
      { ...valid, projectPath: path.dirname(f.root) },
      { ...valid, artifact: { ...f.artifact, approved: false } },
      { ...valid, artifact: { ...f.artifact, sha256: "f".repeat(64) } },
      { ...valid, model: "../unsafe" },
      { ...valid, allowFallback: true }
    ];
    for (const params of malformed) {
      const r = await request(bridge, "project.compose", params);
      assert.equal(r.error?.code, -32602, JSON.stringify(params));
    }
    assert.equal(executed, false);
  } finally { f.close(); }
});

test("project.compose fails closed when provider unavailable and does not synthesize a generic plan", async () => {
  const f = setup();
  try {
    const bridge = createBridge({ projectRoot: f.root, services: {
      runtime: { providers: { get: () => ({
        detect: async () => ({ installed: false })
      }) } }
    } });
    const r = await request(bridge, "project.compose", {
      artifact: f.artifact, providerId: "codex", approvedModelUse: true
    });
    assert.equal(r.error?.code, -32603);
    assert.equal(r.result, undefined);
  } finally { f.close(); }
});

test("project.compose rejects failed provider process, even with valid-looking JSON", async () => {
  const f = setup();
  let calls = 0;
  try {
    const bridge = createBridge({
      projectRoot: f.root,
      services: {
        runtime: {
          providers: {
            get(id) {
              if (id !== "codex") return null;
              return {
                async detect() { return { installed: true }; },
                async execute() {
                  calls++;
                  return { result: Promise.resolve({
                    exitCode: 1,
                    stdout: JSON.stringify({tasks: [{
                      id: "api", title: "Implement request validation",
                      objective: "Reject malformed payloads with typed errors",
                      dependsOn: [],
                      acceptanceCriteria: ["Invalid requests produce 400"],
                      requiredCapabilities: ["backend"]
                    }]})
                  }) };
                }
              };
            }
          }
        }
      }
    });
    const response = await request(bridge, "project.compose", {
      artifact: f.artifact, approvedModelUse: true, providerId: "codex"
    });
    assert.equal(response.error?.code, -32603);
    assert.equal(calls, 1);
  } finally { f.close(); }
});

test("project.compose does not claim capability when Maestro runtime is not connected", async () => {
  const f = setup();
  try {
    const bridge = createBridge({ projectRoot: f.root, services: {} });
    const init = await request(bridge, "initialize", { protocolVersion: 1 });
    assert.equal(init.result.capabilities.projectCompose, false);
    const response = await request(bridge, "project.compose", {
      artifact: f.artifact, approvedModelUse: true, providerId: "codex"
    });
    assert.equal(response.error?.code, -32602);
  } finally { f.close(); }
});


test("project.compose rejects an obsolete DAG if Maestro context changes during model planning", async () => {
  const f = setup();
  let calls = 0;
  const proposal = { tasks: [{
    id: "api", title: "Implement request validation",
    objective: "Reject malformed payloads with typed errors",
    type: "api", dependsOn: [],
    acceptanceCriteria: ["Requests with invalid payloads produce 400"],
    requiredCapabilities: ["backend"]
  }] };
  try {
    const bridge = createBridge({
      projectRoot: f.root,
      services: {
        runtime: {
          providers: {
            get(id) {
              if (id !== "codex") return null;
              return {
                async detect() { return { installed: true }; },
                async execute() {
                  calls++;
                  fs.writeFileSync(path.join(f.root, "AGENTS.md"),
                    "# Canonical project\nChanged instructions during composition.\n");
                  return { result: Promise.resolve({
                    exitCode: 0, stdout: JSON.stringify(proposal)
                  }) };
                }
              };
            }
          }
        }
      }
    });
    const response = await request(bridge, "project.compose", {
      artifact: f.artifact, approvedModelUse: true, providerId: "codex"
    });
    assert.equal(calls, 1);
    assert.equal(response.error?.code, -32602);
    assert.match(response.error?.message || "", /context changed/i);
    assert.equal(response.result, undefined);
  } finally { f.close(); }
});
