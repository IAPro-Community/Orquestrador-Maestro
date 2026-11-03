"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const { inspectRunAdmissions, reconcileExpiredRunAdmissions } = require("../reconciliation");

const sha = (str) => crypto.createHash("sha256").update(str).digest("hex");
function admission(suffix) {
  return {
    projectId: "project-reconcile",
    clientKey: "key-reconcile-" + suffix,
    planDigest: sha("plan-" + suffix),
    artifactDigest: sha("artifact"),
    workspaceFingerprint: sha("workspace-" + suffix),
    approvalDigest: sha("approval"),
    taskCount: 1,
    providers: ["agy"],
    maxAttempts: 1,
    maxDurationMs: 10000,
    maxCostUSD: 0
  };
}
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-reconcile-"));
  return {
    dir,
    filePath: path.join(dir, "runtime", "runs.json"),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}
async function expire(store, id) {
  await store._mutate(async () => {
    const row = store._state.runSubmissions.find((entry) => entry.id === id);
    row.leaseExpiresAt = "2000-01-01T00:00:00.000Z";
    await store._flush();
  });
}

test("read-only admission inspection is bounded, redacted and does not mutate", async (t) => {
  const f = fixture(); t.after(f.cleanup);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  await store.admitRunSubmission(admission("pending"));
  await store.admitRunSubmission(admission("second"));
  const before = fs.readFileSync(f.filePath, "utf8");
  const report = await inspectRunAdmissions({ store, limit: 1 });
  assert.equal(report.authority, "MAESTRO");
  assert.equal(report.total, 2);
  assert.equal(report.returned, 1);
  assert.equal(report.truncated, true);
  assert.equal(report.reservedWorkspaces, 2);
  assert.equal(report.counts.PENDING_WORKER, 2);
  assert.equal(report.executionEnabled, false);
  assert.doesNotMatch(JSON.stringify(report), /approvalDigest|requestDigest|artifactDigest|workspaceFingerprint|clientKey|providers|description/u);
  assert.equal(fs.readFileSync(f.filePath, "utf8"), before);
});

test("reconciliation defaults to dry-run and quarantines only expired worker leases", async (t) => {
  const f = fixture(); t.after(f.cleanup);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  const stale = (await store.admitRunSubmission(admission("stale"))).submission;
  const active = (await store.admitRunSubmission(admission("active"))).submission;
  const pending = (await store.admitRunSubmission(admission("pending"))).submission;
  await store.claimRunSubmission(stale.id, { workerId: "worker-stale-0001", leaseMs: 1000 });
  await store.claimRunSubmission(active.id, { workerId: "worker-active-0001", leaseMs: 30000 });
  await expire(store, stale.id);
  const before = fs.readFileSync(f.filePath, "utf8");
  const dryRun = await reconcileExpiredRunAdmissions({ store });
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.expiredObserved, 1);
  assert.equal(dryRun.actions[0].outcome, "DRY_RUN");
  assert.equal(fs.readFileSync(f.filePath, "utf8"), before);
  const applied = await reconcileExpiredRunAdmissions({ store, apply: true });
  assert.equal(applied.actions[0].outcome, "QUARANTINED");
  assert.equal(applied.safeToRedispatch, false);
  assert.equal((await store.getRunSubmission(stale.id)).status, "RECONCILIATION_REQUIRED");
  assert.equal((await store.getRunSubmission(active.id)).status, "CLAIMED");
  assert.equal((await store.getRunSubmission(pending.id)).status, "PENDING_WORKER");
  assert.equal((await reconcileExpiredRunAdmissions({ store, apply: true })).processed, 0);
  assert.deepEqual(await store.listRuns({}), []);
  await assert.rejects(store.admitRunSubmission({
    ...admission("new-stale-key"), workspaceFingerprint: admission("stale").workspaceFingerprint
  }), { code: "WORKSPACE_RESERVED" });
});

test("reconciliation applies bounded partial batches and rejects invalid options", async (t) => {
  const f = fixture(); t.after(f.cleanup);
  const store = new JsonFileRunStore({ filePath: f.filePath });
  for (let i = 0; i < 3; i++) {
    const row = (await store.admitRunSubmission(admission("case" + i))).submission;
    await store.claimRunSubmission(row.id, { workerId: "worker-case-000" + i });
    await expire(store, row.id);
  }
  const result = await reconcileExpiredRunAdmissions({ store, limit: 1, apply: true });
  assert.equal(result.expiredObserved, 3);
  assert.equal(result.processed, 1);
  assert.equal(result.truncated, true);
  assert.equal((await store.listRunSubmissions({ status: "RECONCILIATION_REQUIRED" })).length, 1);
  await assert.rejects(inspectRunAdmissions({ store, limit: 0 }), RangeError);
  await assert.rejects(reconcileExpiredRunAdmissions({ store, apply: "true" }), TypeError);
});

test("CLI exposes read-only admission report and explicit opt-in reconciliation", async (t) => {
  const f = fixture(); t.after(f.cleanup);
  const cli = path.resolve(__dirname, "../../../bin/orquestrador-maestro.js");
  const invoke = (args) => spawnSync(process.execPath, [cli, "runs", ...args, "--project-path", f.dir], {
    cwd: f.dir, encoding: "utf8", timeout: 25000, windowsHide: true
  });
  const inspected = invoke(["admissions", "--limit", "5"]);
  assert.equal(inspected.status, 0, inspected.stderr.slice(-1000));
  assert.equal(JSON.parse(inspected.stdout).executionEnabled, false);
  const invalid = invoke(["admissions", "--apply"]);
  assert.notEqual(invalid.status, 0);
  const dry = invoke(["reconcile"]);
  assert.equal(dry.status, 0, dry.stderr.slice(-1000));
  assert.equal(JSON.parse(dry.stdout).applied, false);
});
