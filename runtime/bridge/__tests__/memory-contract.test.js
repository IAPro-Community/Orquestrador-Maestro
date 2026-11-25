"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createBridge } = require("../index");
const { MEMORY_CONTRACT, memoryCapabilities, validateMemorySurface } = require("../memory-contract");
const { Memory } = require("../../../orquestrador/bin/memory");

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-memory-contract-"));
  const projectRoot = path.join(base, "repo");
  fs.mkdirSync(projectRoot);
  const git = (...args) => execFileSync("git", ["-C", projectRoot, ...args], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Contract Test");
  git("config", "user.email", "test@example.local");
  git("commit", "--allow-empty", "-qm", "initial");
  const memory = new Memory({ baseDir: path.join(base, "mem") });
  const read = createBridge({ projectRoot, services: { memory }, memoryWriteEnabled: false });
  const write = createBridge({ projectRoot, services: { memory }, memoryWriteEnabled: true });
  const rpc = (bridge, method, params = {}) => bridge.handle({ jsonrpc: "2.0", id: 7, method, params });
  return { base, read, write, rpc, cleanup() { fs.rmSync(base, { recursive: true, force: true }); } };
}

test("initialize.capabilities.memory is exactly the canonical projection", async () => {
  const f = fixture();
  try {
    const response = await f.rpc(f.read, "initialize");
    assert.deepEqual(response.result.capabilities.memory, { version: 1, read: true, write: false, scoped: true });
    assert.deepEqual(response.result.capabilities.memory, memoryCapabilities({ writeEnabled: false }));
  } finally { f.cleanup(); }
});

test("the read surface rejects Maestro-derived scope instead of trusting the client", async () => {
  const f = fixture();
  try {
    for (const forbidden of MEMORY_CONTRACT.derivedParams) {
      const response = await f.rpc(f.read, "memory.search", { [forbidden]: "forged" });
      assert.equal(response.error?.code, -32602, `${forbidden} must be rejected`);
    }
    const malformed = await f.rpc(f.read, "memory.get", { id: "../../etc/passwd" });
    assert.equal(malformed.error?.code, -32602);
  } finally { f.cleanup(); }
});

test("promotion is never reachable over the wire, even with write enabled", async () => {
  const f = fixture();
  try {
    for (const method of MEMORY_CONTRACT.forbiddenMethods) {
      const response = await f.rpc(f.write, method, { id: "obs_0123456789abcdef" });
      assert.equal(response.error?.code, -32601, `${method} must stay method-not-found`);
    }
    // A caller cannot smuggle verification into a write: the parameter is not
    // part of the write contract and the canonical writer forces verified=false.
    const smuggled = await f.rpc(f.write, "memory.record", {
      confirmed: true,
      reason: "Attempt to self-verify an observation",
      idempotencyKey: "contract-self-verify-01",
      type: "decision",
      summary: "Self-verified claim that must stay unverified",
      scopeLevel: "branch",
      verified: true
    });
    assert.equal(smuggled.error?.code, -32602);
    const recorded = await f.rpc(f.write, "memory.record", {
      confirmed: true,
      reason: "Consent for a scoped contract observation",
      idempotencyKey: "contract-record-01",
      type: "decision",
      summary: "Canonical memory stays the only semantic store",
      scopeLevel: "branch"
    });
    assert.equal(recorded.result.status, "RECORDED");
    assert.equal(recorded.result.verified, undefined, "a write never returns a verification claim");
    const readBack = await f.rpc(f.read, "memory.search", { type: "decision" });
    assert.equal(readBack.result.items.length, 1);
    assert.equal(readBack.result.items[0].verified, false, "a model-written observation is never verified");
  } finally { f.cleanup(); }
});

test("the contract gate rejects any surface drift", () => {
  const declared = Object.fromEntries(Object.keys(MEMORY_CONTRACT.methods).map((name) => [name, () => null]));
  assert.equal(validateMemorySurface(declared).version, 1);
  assert.throws(() => validateMemorySurface({ ...declared, "memory.forget": () => null }), /undeclared/);
  const { "memory.get": _dropped, ...withoutGet } = declared;
  assert.throws(() => validateMemorySurface(withoutGet), /missing/);
  assert.throws(() => validateMemorySurface({ ...declared, "memory.promote": () => null }), /forbidden|undeclared/);
});

test("every declared parameter is accepted by the real implementation surface", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "memory-api.js"), "utf8")
    + fs.readFileSync(path.join(__dirname, "..", "memory-write.js"), "utf8");
  for (const [method, spec] of Object.entries(MEMORY_CONTRACT.methods)) {
    for (const param of spec.params) {
      assert.ok(source.includes(param), `${method} declares ${param} but the implementation never mentions it`);
    }
  }
  for (const derived of MEMORY_CONTRACT.derivedParams) {
    assert.ok(source.includes(derived), `derived parameter ${derived} is not enforced by the implementation`);
  }
});