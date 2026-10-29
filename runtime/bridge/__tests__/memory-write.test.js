"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Memory } = require("../../../orquestrador/bin/memory");
const { resolveGitContext } = require("../../../orquestrador/lib/git-context");
const { createGuardedMemoryWriter } = require("../memory-write");

function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-bridge-write-"));
  const root = path.join(tmp, "project");
  fs.mkdirSync(root);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.local");
  git("commit", "--allow-empty", "-qm", "initial");
  const memory = new Memory({ baseDir: path.join(tmp, "mem") });
  const input = {
    confirmed: true, reason: "operator confirmed an isolated test",
    idempotencyKey: "test-001", type: "decision",
    summary: "Prefer bounded migration steps", scopeLevel: "branch"
  };
  return { tmp, root, memory, input, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test("memory writes are disabled unless the server explicitly opts in", () => {
  const f = fixture();
  try {
    const writer = createGuardedMemoryWriter({ projectRoot: f.root, memory: f.memory });
    assert.throws(() => writer.record(f.input), /requires explicit/);
    assert.equal(f.memory.readObservations(f.memory.getObservationsFile(resolveGitContext(f.root).repositoryId)).valid.length, 0);
  } finally { f.cleanup(); }
});

test("confirmed record uses canonical store and replays the same stable ID", () => {
  const f = fixture();
  try {
    const writer = createGuardedMemoryWriter({ projectRoot: f.root, memory: f.memory, enabled: true });
    const first = writer.record(f.input);
    const replay = writer.record(f.input);
    assert.equal(first.status, "RECORDED");
    assert.equal(replay.status, "REPLAYED");
    assert.equal(replay.id, first.id);
    const context = resolveGitContext(f.root);
    const rows = f.memory.searchWithVisibility(context.repositoryId, context);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source.operatorConfirmed, true);
    assert.equal(rows[0].verified, false);
  } finally { f.cleanup(); }
});

test("same idempotency key cannot mutate content, branch or approved scope", () => {
  const f = fixture();
  try {
    const writer = createGuardedMemoryWriter({ projectRoot: f.root, memory: f.memory, enabled: true });
    writer.record(f.input);
    assert.throws(() => writer.record({ ...f.input, summary: "another decision" }), /idempotencyKey already used/);
    assert.throws(() => writer.record({ ...f.input, scopeLevel: "repository" }), /idempotencyKey already used/);
    execFileSync("git", ["-C", f.root, "checkout", "-qb", "feature"], { stdio: "pipe" });
    assert.throws(() => writer.record(f.input), /idempotencyKey already used/);
  } finally { f.cleanup(); }
});

test("reject invalid requests before any persistence", () => {
  const f = fixture();
  try {
    const writer = createGuardedMemoryWriter({ projectRoot: f.root, memory: f.memory, enabled: true });
    for (const change of [
      { confirmed: false }, { reason: "" }, { idempotencyKey: "../../escape" },
      { type: "__unknown" }, { scopeLevel: "global" },
      { scopeLevel: "task", taskId: undefined }, { summary: "x".repeat(501) },
      { projectPath: "/tmp/not-the-project" }, { repositoryId: "forged" },
      { tags: Array.from({ length: 17 }, () => "tag") }
    ]) {
      assert.throws(() => writer.record({ ...f.input, ...change }));
    }
    const file = f.memory.getObservationsFile(resolveGitContext(f.root).repositoryId);
    assert.equal(f.memory.readObservations(file).valid.length, 0);
  } finally { f.cleanup(); }
});

test("Maestro capture privacy policy can reject confirmed writes", () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.root, "DEV"));
    fs.writeFileSync(path.join(f.root, "DEV", "memory-policy.json"), JSON.stringify({ capture: false }));
    const writer = createGuardedMemoryWriter({ projectRoot: f.root, memory: f.memory, enabled: true });
    assert.throws(() => writer.record(f.input), /capture policy rejected/);
    assert.throws(() => writer.record({ ...f.input, summary: "<private>do not persist</private>" }));
  } finally { f.cleanup(); }
});
