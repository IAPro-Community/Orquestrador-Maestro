"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createBridge } = require("../index");
const { Memory } = require("../../../orquestrador/bin/memory");

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-write-rpc-"));
  const projectRoot = path.join(base, "repo");
  fs.mkdirSync(projectRoot);
  const git = (...args) => execFileSync("git", ["-C", projectRoot, ...args], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Bridge Test");
  git("config", "user.email", "test@example.local");
  git("commit", "--allow-empty", "-qm", "initial");
  const memory = new Memory({ baseDir: path.join(base, "mem") });
  const read = createBridge({ projectRoot, services: { memory }, memoryWriteEnabled: false });
  const write = createBridge({ projectRoot, services: { memory }, memoryWriteEnabled: true });
  const rpc = (bridge, method, params = {}) => bridge.handle({ jsonrpc: "2.0", id: 21, method, params });
  const params = {
    confirmed: true,
    reason: "Explicit consent for scoped test observation",
    idempotencyKey: "rpc-test-001",
    type: "decision",
    summary: "Keep Maestro as sole semantic memory",
    scopeLevel: "branch"
  };
  return { base, projectRoot, memory, read, write, rpc, params,
    cleanup() { fs.rmSync(base, { recursive: true, force: true }); } };
}

test("initialize truthfully negotiates write opt-in with unchanged Bridge v1", async () => {
  const f = fixture();
  try {
    const a = await f.rpc(f.read, "initialize");
    const b = await f.rpc(f.write, "initialize");
    assert.equal(a.result.protocolVersion, 1);
    assert.equal(a.result.capabilities.memory.write, false);
    assert.equal(b.result.capabilities.memory.write, true);
    assert.equal(a.result.capabilities.memory.read, true);
  } finally { f.cleanup(); }
});

test("read-only Bridge fails closed while consented Bridge writes and reads canonically", async () => {
  const f = fixture();
  try {
    const denied = await f.rpc(f.read, "memory.record", f.params);
    assert.equal(denied.error.code, -32601);
    const first = await f.rpc(f.write, "memory.record", f.params);
    assert.equal(first.result.status, "RECORDED");
    const replay = await f.rpc(f.write, "memory.record", f.params);
    assert.equal(replay.result.status, "REPLAYED");
    assert.equal(replay.result.id, first.result.id);
    const result = await f.rpc(f.read, "memory.search");
    assert.equal(result.result.items.length, 1);
    assert.equal(result.result.items[0].id, first.result.id);
    assert.equal(result.result.items[0].verified, false);
  } finally { f.cleanup(); }
});

test("malformed approval, forged branch and conflicting idempotency receive invalid params", async () => {
  const f = fixture();
  try {
    for (const params of [
      { ...f.params, confirmed: false },
      { ...f.params, scopeLevel: "global" },
      { ...f.params, branch: "other" },
      { ...f.params, summary: "<private>no storage</private>" }
    ]) {
      const result = await f.rpc(f.write, "memory.record", params);
      // Private content is rejected by canonical Maestro policy as internal,
      // while malformed requests return a stable invalid-params error.
      assert.ok(result.error);
    }
    const accepted = await f.rpc(f.write, "memory.record", f.params);
    assert.equal(accepted.result.status, "RECORDED");
    const conflict = await f.rpc(f.write, "memory.record", { ...f.params, summary: "different" });
    assert.equal(conflict.error.code, -32602);
  } finally { f.cleanup(); }
});
