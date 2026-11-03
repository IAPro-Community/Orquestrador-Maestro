"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { normalizeExecutableManifest, validateStoredExecutableManifest } = require("../executable-manifest");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
function task(id, dependsOn = [], overrides = {}) {
  return {
    taskId: id, dependsOn, providerId: "opencode", modelId: "default",
    workspaceFingerprint: hash("worktree-A"), headCommit: "a".repeat(40),
    branch: "release/v1.0.0", promptDigest: hash("prompt-" + id),
    acceptanceDigest: hash("accept-" + id), sandbox: "none",
    maxAttempts: 1, maxDurationMs: 120000, maxCostUSD: 2,
    ...overrides
  };
}
function plan(tasks = [task("task-one"), task("task-two", ["task-one"])]) {
  return {
    schemaVersion: 1, projectId: "project-manifest-001",
    planDigest: hash("approved-DAG"), artifactDigest: hash("rendered-artifact"),
    maxCostUSD: 5, tasks
  };
}
test("canonical digest is task-order independent, immutable and never persists a prompt", () => {
  const first = normalizeExecutableManifest(plan());
  const reversed = normalizeExecutableManifest(plan([
    task("task-two", ["task-one"]), task("task-one")
  ]));
  assert.deepEqual(first, reversed);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.equal(first.id, "manifest-" + first.digest);
  assert.equal(validateStoredExecutableManifest(JSON.parse(JSON.stringify(first))).id, first.id);
  assert.equal(JSON.stringify(first).includes("prompt-body"), false);
  assert.equal(JSON.stringify(first).includes("rendered-artifact"), false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.tasks), true);
});
test("reject cycles, unknown dependencies, parallel writers, unsafe metadata and overspend", () => {
  const cases = [
    plan([task("task-one", ["task-two"]), task("task-two", ["task-one"])]),
    plan([task("task-one", ["missing-task"])]),
    plan([task("task-one"), task("task-two")]),
    plan([task("task-one", [], { modelId: "evil\nmodel" })]),
    plan([task("task-one", [], { sandbox: "root" })]),
    plan([task("task-one", [], { maxCostUSD: 6 })]),
    plan([task("task-one", [], { worktreePath: "/etc/passwd" })]),
    plan([task("task-one"), task("task-one")])
  ];
  for (const invalid of cases) {
    assert.throws(() => normalizeExecutableManifest(invalid), { code: /INVALID_EXECUTABLE_MANIFEST|MANIFEST_WORKTREE_CONFLICT|MANIFEST_BUDGET_EXCEEDED/ });
  }
  const parallel = normalizeExecutableManifest(plan([
    task("task-one"),
    task("task-two", [], { workspaceFingerprint: hash("worktree-B") })
  ]));
  assert.equal(parallel.tasks.length, 2);
});
test("RunStore persists DAG once, rejects rebindings and detects tampered digests after restart", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-manifest-"));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  const filePath = path.join(dir, "runs.json");
  const store = new JsonFileRunStore({ filePath });
  await store.createProject({ id: "project-manifest-001", path: dir });
  const original = await store.putExecutableManifest(plan());
  const replayed = await store.putExecutableManifest(plan());
  assert.deepEqual(replayed, original);
  assert.deepEqual(await store.getExecutableManifest(original.id), original);
  assert.equal((await new JsonFileRunStore({ filePath }).listExecutableManifests({ projectId: original.projectId })).length, 1);
  await assert.rejects(store.putExecutableManifest(plan([
    task("task-one", [], { providerId: "codex" }),
    task("task-two", ["task-one"])
  ])), { code: "EXECUTABLE_MANIFEST_CONFLICT" });

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  raw.executableManifests[0].tasks[0].providerId = "agy";
  fs.writeFileSync(filePath, JSON.stringify(raw));
  await assert.rejects(new JsonFileRunStore({ filePath }).initialize(), { code: "RUN_STORE_CORRUPTED" });
});
test("older RunStore schema without executableManifests remains readable and upgrades additively", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-manifest-legacy-"));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  const filePath = path.join(dir, "runs.json");
  const store = new JsonFileRunStore({ filePath });
  await store.createProject({ id: "project-manifest-001", path: dir });
  const old = JSON.parse(fs.readFileSync(filePath, "utf8"));
  delete old.executableManifests;
  fs.writeFileSync(filePath, JSON.stringify(old));
  const after = new JsonFileRunStore({ filePath });
  assert.deepEqual(await after.listExecutableManifests(), []);
  const saved = await after.putExecutableManifest(plan());
  assert.equal((await after.getExecutableManifest(saved.id)).id, saved.id);
  assert.equal(JSON.parse(fs.readFileSync(filePath, "utf8")).executableManifests.length, 1);
});
