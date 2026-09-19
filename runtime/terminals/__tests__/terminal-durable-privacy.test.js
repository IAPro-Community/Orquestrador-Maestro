"use strict";

/**
 * Terminal durable-privacy gates (PR #18 blocker follow-up).
 *
 * The provider → events route was already ephemeral, but the
 * terminal → terminal-record → RunStore route still persisted raw
 * stdout/stderr per chunk (plus raw argv). These tests prove against the
 * physical runs.json file that:
 *
 * - managed-terminal stdout/stderr sentinels never reach disk, while live
 *   waiters in the same process still receive the output from memory;
 * - secret-looking argv (Bearer tokens, --token values) never persist raw;
 * - many output chunks do not cause per-chunk store writes (no _flush per
 *   chunk / write amplification);
 * - durable terminal errors go through the shared diagnostic sanitizer.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { TerminalManager } = require("../terminal-manager");
const { TerminalSessionManager } = require("../session-manager");
const { sanitizeTerminalError, toPersistedTerminalIdentity } = require("../terminal-persistence");

test("managed terminal stdout/stderr/argv sentinels stay out of runs.json", async () => {
  const rand = String(Date.now()).slice(-6);
  const OUT = `TERM_OUT_SENTINEL_${rand}`;
  const ERR = `TERM_ERR_SENTINEL_${rand}`;
  const TOKEN = `TERM_Bearer_TOKEN_${rand}_SECRET`;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-terminal-privacy-"));
  const filePath = path.join(root, "runs.json");
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();
  const manager = new TerminalManager({ store });
  // Probe file (not -e): node rejects unknown --flags after -e, while a
  // script accepts realistic secret-bearing argv like --token SECRET.
  const probe = path.join(root, "probe.js");
  fs.writeFileSync(probe, `process.stdout.write('${OUT}');process.stderr.write('${ERR}');\n`);
  const terminal = await manager.start({
    projectId: "project-1",
    cwd: root,
    command: process.execPath,
    args: [probe, "--token", TOKEN]
  });
  const completed = await manager.wait(terminal.id);
  assert.equal(completed.status, "completed");
  // Live waiters still get output from process memory.
  assert.match(completed.output, new RegExp(OUT, "u"));
  assert.match(completed.stderr, new RegExp(ERR, "u"));

  const persisted = await store.getTerminal(terminal.id);
  assert.equal(Object.hasOwn(persisted, "output"), false);
  assert.equal(Object.hasOwn(persisted, "stderr"), false);
  assert.equal(Object.hasOwn(persisted, "args"), false);
  assert.equal(persisted.argCount, 3);
  assert.ok(Array.isArray(persisted.redactedArgs));

  const physical = fs.readFileSync(filePath, "utf8");
  for (const sentinel of [OUT, ERR, TOKEN]) {
    assert.equal(physical.includes(sentinel), false, `runs.json must not contain ${sentinel.slice(0, 24)}`);
  }
  // listTerminals() projection is metadata-only as well.
  const listed = JSON.stringify(await store.listTerminals({ projectId: "project-1" }));
  assert.equal(listed.includes(OUT), false);
  assert.equal(listed.includes(TOKEN), false);
});

test("many terminal chunks do not cause per-chunk store writes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-terminal-amplification-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") });
  await store.initialize();
  let saves = 0;
  const originalSave = store.saveTerminal.bind(store);
  store.saveTerminal = async (record) => { saves += 1; return originalSave(record); };
  const manager = new TerminalManager({ store });
  const terminal = await manager.start({
    projectId: "project-1",
    cwd: root,
    command: process.execPath,
    args: ["-e", "process.stdout.write('y'.repeat(100500))"]
  });
  const completed = await manager.wait(terminal.id);
  assert.equal(completed.output.length, 100_000);
  // starting + running + completed only; output chunks never touch the store.
  assert.ok(saves <= 4, `expected bounded terminal writes, got ${saves}`);
});

test("terminal identity redacts secret argv and errors", () => {
  const identity = toPersistedTerminalIdentity("curl", ["-H", "Authorization: Bearer abc123", "--token", "SECRET_XYZ", "--token=EQ_SECRET"]);
  assert.equal(identity.argCount, 5);
  assert.equal(Object.hasOwn(identity, "args"), false);
  assert.deepEqual(identity.redactedArgs.slice(2), ["--token", "[redacted]", "--token=[redacted]"]);
  const serialized = JSON.stringify(identity);
  assert.equal(serialized.includes("abc123"), false);
  assert.equal(serialized.includes("SECRET_XYZ"), false);
  assert.equal(serialized.includes("EQ_SECRET"), false);
  assert.match(serialized, /redacted/iu);

  const clean = sanitizeTerminalError(new Error("request failed 401: Bearer SUPER_SECRET at /home/user/proj/out.txt"));
  assert.equal(clean.includes("SUPER_SECRET"), false);
  assert.equal(clean.includes("/home/user/proj/out.txt"), false);
});

test("native session records persist redacted argv only", async () => {
  const rand = String(Date.now()).slice(-6);
  const TOKEN = `SESSION_TOKEN_${rand}_SECRET`;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-session-privacy-"));
  const filePath = path.join(root, "runs.json");
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();
  const tmux = { available: () => true, create() {}, exists: () => true, close: () => true, attach: () => true };
  const manager = new TerminalSessionManager({ store, tmuxBackend: tmux });
  const session = await manager.create({
    projectId: "project-1",
    workspacePath: root,
    kind: "shell",
    command: "curl",
    args: ["-H", `Authorization: Bearer ${TOKEN}`],
    backend: "tmux"
  });
  assert.equal(session.status, "running");
  const persisted = await store.getTerminal(session.id);
  assert.equal(Object.hasOwn(persisted, "args"), false);
  assert.equal(persisted.argCount, 2);
  const physical = fs.readFileSync(filePath, "utf8");
  assert.equal(physical.includes(TOKEN), false, "session argv secret must not reach disk");
});
