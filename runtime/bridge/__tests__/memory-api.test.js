"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createBridge } = require("../index");
const { Memory } = require("../../../orquestrador/bin/memory");
const { resolveGitContext } = require("../../../orquestrador/lib/git-context");
const { resolveObservationScope } = require("../../../orquestrador/lib/visibility");

function request(bridge, method, params = {}) {
  return bridge.handle({ jsonrpc: "2.0", id: 7, method, params });
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
}

function createFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-memory-bridge-"));
  const projectRoot = path.join(base, "repo");
  fs.mkdirSync(projectRoot);
  git(projectRoot, ["init", "-q", "-b", "main"]);
  git(projectRoot, ["config", "user.name", "Bridge Test"]);
  git(projectRoot, ["config", "user.email", "bridge@example.test"]);
  git(projectRoot, ["commit", "--allow-empty", "-qm", "init"]);
  const memory = new Memory({ baseDir: path.join(base, "memory") });
  const bridge = createBridge({ projectRoot, services: { memory } });
  return {
    base, projectRoot, memory, bridge,
    record(type, summary, options = {}) {
      const ctx = resolveGitContext(projectRoot);
      const scope = resolveObservationScope({
        type, gitContext: ctx, taskId: options.taskId || null,
        explicitScope: { level: options.level || "branch" }
      });
      return memory.record(ctx.repositoryId, {
        type, summary, details: options.details || null, taskId: options.taskId || null, scope
      }, { gitContext: ctx, projectRoot });
    },
    cleanup() { fs.rmSync(base, { recursive: true, force: true }); }
  };
}

test("read-only Bridge memory advertises v1 without changing existing contextBrief capability", async () => {
  const fixture = createFixture();
  try {
    const reply = await request(fixture.bridge, "initialize", { protocolVersion: 1 });
    assert.equal(reply.result.capabilities.contextBrief, true);
    assert.deepEqual(reply.result.capabilities.memory, { version: 1, read: true, write: false, scoped: true });
    for (const method of ["memory.record", "memory.promote", "memory.forget"]) {
      const rejected = await request(fixture.bridge, method);
      assert.equal(rejected.error.code, -32601);
    }
  } finally { fixture.cleanup(); }
});

test("search/get/timeline reuse Maestro storage and visible project-branch scope", async () => {
  const fixture = createFixture();
  try {
    const a = fixture.record("decision", "Decision A", { details: "approved by reviewer" });
    fixture.record("discovery", "Discovery B");
    const found = await request(fixture.bridge, "memory.search", { type: "decision", limit: 1 });
    assert.equal(found.result.authority, "maestro");
    assert.equal(found.result.items.length, 1);
    assert.equal(found.result.items[0].id, a.id);
    assert.equal(found.result.items[0].details, undefined);
    assert.equal(found.result.page.hasMore, false);
    const page = await request(fixture.bridge, "memory.search", { limit: 1 });
    assert.equal(page.result.page.hasMore, true);
    const secondPage = await request(fixture.bridge, "memory.search", { limit: 1, offset: 1 });
    assert.equal(secondPage.result.items.length, 1);
    const detail = await request(fixture.bridge, "memory.get", { id: a.id });
    assert.equal(detail.result.observation.details, "approved by reviewer");
    const timeline = await request(fixture.bridge, "memory.timeline", {});
    assert.equal(timeline.result.items.length, 2);
    assert.ok(timeline.result.items.every(row => row.scopeLevel === "branch"));
  } finally { fixture.cleanup(); }
});

test("branch, workspace, task and project isolation deny cross-scope reads", async () => {
  const fixture = createFixture();
  try {
    const branch = fixture.record("decision", "Only on main");
    const repo = fixture.record("decision", "Repository-global", { level: "repository" });
    const task = fixture.record("attempt", "Only in task-1", { taskId: "task-1", level: "task" });
    const otherRoot = path.join(fixture.base, "other");
    fs.mkdirSync(otherRoot);
    const otherBridge = createBridge({ projectRoot: otherRoot, services: { memory: fixture.memory } });
    const otherResult = await request(otherBridge, "memory.search");
    assert.equal(otherResult.result.items.length, 0);

    git(fixture.projectRoot, ["checkout", "-qb", "feature"]);
    const onFeature = await request(fixture.bridge, "memory.search", { taskId: "task-1" });
    assert.deepEqual(onFeature.result.items.map(i => i.id), [repo.id]);
    const invisible = await request(fixture.bridge, "memory.get", { id: branch.id });
    assert.equal(invisible.result, null);
    const taskHidden = await request(fixture.bridge, "memory.get", { id: task.id, taskId: "other" });
    assert.equal(taskHidden.result, null);
    git(fixture.projectRoot, ["checkout", "-q", "main"]);
    const taskFound = await request(fixture.bridge, "memory.get", { id: task.id, taskId: "task-1" });
    assert.equal(taskFound.result.observation.id, task.id);
    const noTask = await request(fixture.bridge, "memory.get", { id: task.id });
    assert.equal(noTask.result, null);
  } finally { fixture.cleanup(); }
});

test("memory Bridge rejects forged scope, unsafe inputs and malformed IDs", async () => {
  const fixture = createFixture();
  try {
    for (const params of [
      { projectPath: "/tmp/another-project" }, { repositoryId: "repo_other" },
      { branch: "main" }, { scope: "repository" }, { workspaceId: "other" },
      { allowAncestry: true }, { offset: -1 }, { limit: 51 },
      { search: "x".repeat(201) }, { type: "__proto__" }, { taskId: "../../escape" }
    ]) {
      const rejected = await request(fixture.bridge, "memory.search", params);
      assert.equal(rejected.error?.code, -32602, JSON.stringify(params));
    }
    const get = await request(fixture.bridge, "memory.get", { id: "../anything" });
    assert.equal(get.error.code, -32602);
  } finally { fixture.cleanup(); }
});

test("legacy secrets are redacted on output and explicitly private observations are excluded", async () => {
  const fixture = createFixture();
  try {
    const original = fixture.record("decision", "Safe decision");
    const ctx = resolveGitContext(fixture.projectRoot);
    const file = fixture.memory.getObservationsFile(ctx.repositoryId);
    const legacy = {
      ...original, id: "obs_0123456789abcdef", summary: "api_key=older-private-key",
      details: "password=very-secret"
    };
    const hidden = { ...original, id: "obs_0123456789abcdee", summary: "<private>do not expose</private>" };
    fs.appendFileSync(file, JSON.stringify(legacy) + "\n" + JSON.stringify(hidden) + "\n");
    const search = await request(fixture.bridge, "memory.search");
    assert.equal(search.result.items.length, 2);
    assert.doesNotMatch(JSON.stringify(search.result), /older-private-key|do not expose/);
    const read = await request(fixture.bridge, "memory.get", { id: legacy.id });
    assert.doesNotMatch(JSON.stringify(read.result), /very-secret|older-private-key/);
  } finally { fixture.cleanup(); }
});
