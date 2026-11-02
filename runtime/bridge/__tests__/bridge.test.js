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

test("bridge exposes bounded canonical context with provenance and no secrets", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-brief-"));
  try {
    fs.mkdirSync(path.join(root, "DEV"), { recursive: true });
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Rules\\nDo not break compatibility.\\napi_key=private-123\\n");
    fs.writeFileSync(path.join(root, "DEV", "INDEX.md"), "# Knowledge\\nRemember the verified release gates.\\n");
    const bridge = createBridge({ projectRoot: root });
    const init = await bridge.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal(init.result.capabilities.contextBrief, true);
    const response = await bridge.handle({
      jsonrpc: "2.0", id: 2, method: "context.brief",
      params: { task: "Continue the release", taskId: "release-1", maxChars: 2500 }
    });
    assert.equal(response.error, undefined);
    assert.match(response.result.content, /Do not break compatibility/);
    assert.doesNotMatch(response.result.content, /private-123/);
    assert.ok(response.result.used <= 2500);
    assert.equal(response.result.manifest.version, 1);
    assert.match(response.result.manifest.contentDigest, /^[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bridge redacts secrets present in the task intent itself", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-secret-"));
  try {
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Test rules\\n");
    const bridge = createBridge({ projectRoot: root });
    const response = await bridge.handle({
      jsonrpc: "2.0", id: 3, method: "context.brief",
      params: { task: "Review api_key=private-must-not-appear", maxChars: 2500 }
    });
    assert.equal(response.error, undefined);
    assert.doesNotMatch(response.result.content, /private-must-not-appear/);
    assert.match(response.result.content, /api_key=\\[redigido\\]/);
    assert.equal(response.result.task.includes("private-must-not-appear"), false);
    assert.doesNotMatch(JSON.stringify(response.result), /private-must-not-appear/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bridge rejects context requests outside the active project or budget", async () => {
  const bridge = createBridge({ projectRoot: process.cwd() });
  const invalid = [
    { projectPath: "/tmp/other-project" },
    { maxChars: 999 },
    { maxChars: 64000 },
    { task: "x".repeat(501) },
    { taskId: "../../unsafe" },
    { since: "main; echo nope" }
  ];
  for (const params of invalid) {
    const response = await bridge.handle({ jsonrpc: "2.0", id: 9, method: "context.brief", params });
    assert.equal(response.error?.code, -32602, JSON.stringify(params));
  }
});

test("bridge v1 rejects removed cli-novo surfaces", async () => {
  const bridge = createBridge({ projectRoot: process.cwd() });
  for (const method of ["projects.dashboard", "terminals.create", "agentSessions.create", "panes.list"]) {
    const response = await bridge.handle({ jsonrpc: "2.0", id: method, method, params: {} });
    assert.equal(response.error.code, -32601);
  }
});

test("project.context projects canonical context and project identity without duplicating storage", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-project-context-"));
  try {
    fs.mkdirSync(path.join(root, "DEV"), { recursive: true });
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Rules\nPreserve verified decisions.\napi_key=do-not-expose\n");
    fs.writeFileSync(path.join(root, "DEV", "INDEX.md"), "# Project\nCanonical architecture.\n");

    const calls = [];
    const bridge = createBridge({
      projectRoot: root,
      services: {
        projectInspector: {
          inspect: async (params) => {
            calls.push(params);
            return {
              id: "prj-canonical",
              name: "canonical-example",
              known: true,
              status: "idle",
              latestRun: { confidential: "do-not-project" }
            };
          }
        }
      }
    });

    const init = await bridge.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal(init.result.capabilities.projectContext, true);
    const response = await bridge.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "project.context",
      params: { projectPath: root, task: "Continue verified work", taskId: "task-1", maxChars: 2500 }
    });
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    assert.equal(response.result.authority, "MAESTRO");
    assert.equal(response.result.schemaVersion, 1);
    assert.deepEqual(response.result.project, {
      id: "prj-canonical",
      name: "canonical-example",
      known: true,
      status: "idle"
    });
    assert.deepEqual(calls, [{ projectPath: root }]);
    assert.equal(response.result.context.manifest.version, 1);
    assert.match(response.result.context.manifest.contentDigest, /^[a-f0-9]{64}$/);
    assert.match(response.result.context.content, /Preserve verified decisions/);
    assert.doesNotMatch(JSON.stringify(response.result), /do-not-expose|do-not-project/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project.context rejects invalid project scope and unsafe context parameters before inspection", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-project-scope-"));
  let calls = 0;
  try {
    const bridge = createBridge({
      projectRoot: root,
      services: { projectInspector: { inspect: async () => { calls++; return { id: "unexpected" }; } } }
    });
    for (const params of [
      { projectPath: path.dirname(root) },
      { maxChars: 999 },
      { taskId: "../../escape" },
      { task: "x".repeat(501) }
    ]) {
      const response = await bridge.handle({
        jsonrpc: "2.0", id: 9, method: "project.context", params
      });
      assert.equal(response.error?.code, -32602, JSON.stringify(params));
    }
    assert.equal(calls, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
