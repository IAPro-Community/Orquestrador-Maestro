"use strict";

/**
 * Opt-in certification matrix for durable execution against REAL provider CLIs.
 *
 * This test is skipped unless `MAESTRO_REAL_PROVIDER_E2E=1`. It uses the user's
 * installed and authenticated CLIs (codex, claude, opencode, agy), so it costs
 * real tokens and must never run implicitly in CI.
 *
 * What it proves when enabled:
 * - the real CLI is detected and its version is recorded;
 * - durable admission + worker dispatch execute the provider (no shim);
 * - the persisted Run has exactly the selected provider (no silent fallback);
 * - a queued submission can be cancelled before dispatch;
 * - a stale claim is quarantined by the reconciler, never redispatched.
 *
 * Evidence is written to `MAESTRO_REAL_PROVIDER_EVIDENCE` (default: a temp
 * file) and printed at the end, so a homologation comment can cite it.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync, spawn } = require("node:child_process");
const test = require("node:test");
const { MaestroApplication } = require("../runtime/application/maestro-application");
const { createBridge } = require("../runtime/bridge/bridge");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "orquestrador-maestro.js");
const enabled = process.env.MAESTRO_REAL_PROVIDER_E2E === "1";
const requested = (process.env.MAESTRO_REAL_PROVIDER_IDS || "codex,claude,opencode,agy")
  .split(",").map((value) => value.trim()).filter(Boolean);
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function providerVersion(providerId) {
  const result = spawnSync(providerId, ["--version"], {
    encoding: "utf8",
    timeout: 30000,
    shell: process.platform === "win32"
  });
  if (result.status !== 0) return "unavailable";
  const line = String(result.stdout || result.stderr || "").split("\n")[0].trim();
  return line || "present";
}

function submitParams(clientKey, providerId, content) {
  return {
    clientKey,
    artifact: { id: `artifact-real-${providerId}`, version: 1, content, sha256: digest(content) },
    approvedModelUse: true,
    plan: {
      tasks: [{
        id: `task-real-${providerId}`,
        title: "Real provider certification",
        objective: "Reply with exactly OK and do not modify any files.",
        dependsOn: [],
        acceptanceCriteria: ["the provider CLI answered"]
      }]
    },
    assignments: [{ taskId: `task-real-${providerId}`, providerId, sandbox: "none" }],
    approval: { decision: "approved", approvedBy: "real-provider-e2e" }
  };
}

function runWorkerOnce(root) {
  const worker = spawn(process.execPath,
    [cli, "runs", "worker", "--project-path", root, "--once", "--interval", "50"], {
      cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
    });
  let stdout = "";
  let stderr = "";
  worker.stdout.on("data", (chunk) => { stdout += String(chunk); });
  worker.stderr.on("data", (chunk) => { stderr += String(chunk); });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker timed out")), 600000);
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`worker exited ${code}: ${stderr.slice(-500)}`));
      else resolve(stdout);
    });
  });
}

test("real provider certification matrix (opt-in)", {
  timeout: 1800000,
  skip: enabled ? false : "set MAESTRO_REAL_PROVIDER_E2E=1 to run against real provider CLIs"
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-real-provider-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  fs.writeFileSync(path.join(root, "README.md"), "real provider certification base\n");
  git(root, "init", "-q");
  git(root, "config", "user.name", "Real Provider E2E");
  git(root, "config", "user.email", "real-provider-e2e@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");

  const app = new MaestroApplication({ projectRoot: root });
  await app.registerProject({ projectPath: root });
  const bridge = createBridge({ projectRoot: root, services: { runtime: app, runStore: app.store } });
  const submitPlan = async (params) => {
    const response = await bridge.handle({ jsonrpc: "2.0", id: 1, method: "runs.submit", params });
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    return response.result;
  };
  const submissions = [];
  const cases = [];

  for (const providerId of requested) {
    const adapter = app.providers.get(providerId);
    if (!adapter) {
      cases.push({ providerId, status: "not-registered" });
      continue;
    }
    const detection = await adapter.detect();
    if (!detection.installed) {
      cases.push({ providerId, status: "not-installed", version: "unavailable" });
      continue;
    }
    const content = `Reply with exactly OK. Do not modify any files. (${providerId})`;
    const submit = await submitPlan(submitParams(`client-real-${providerId}`, providerId, content));
    submissions.push(submit.submissionId);
    await runWorkerOnce(root);
    const row = await app.store.getRunSubmission(submit.submissionId);
    assert.equal(row.status, "COMPLETED", `${providerId}: ${JSON.stringify(row.status)}`);
    assert.deepEqual(row.providers, [providerId]);
    const run = await app.store.getRun(row.runId);
    assert.ok(run, `${providerId}: persisted run missing`);
    assert.equal(run.providerId, providerId, `${providerId}: fallback provider executed`);
    const executions = await app.store.listExecutions({ runId: run.id });
    assert.ok(executions.length >= 1, `${providerId}: no execution persisted`);
    cases.push({
      providerId,
      status: "COMPLETED",
      version: providerVersion(providerId),
      submissionId: submit.submissionId,
      runId: run.id,
      runStatus: run.status,
      executionCount: executions.length,
      reportedCostUSD: executions[0]?.metadata?.usage?.costUSD ?? null,
      costSource: executions[0]?.metadata?.usage?.costSource ?? null
    });
  }

  const executed = cases.filter((item) => item.status === "COMPLETED");
  const missing = cases.filter((item) => item.status === "not-installed" || item.status === "not-registered");
  if (executed.length === 0) {
    // No provider available is not a pass: the certification did not happen.
    console.error("No real provider was available; certification was not performed.");
  }

  const [first] = submissions;
  if (first) {
    // Cancellation of a fresh queued submission must be immediate.
    const content = "Reply with exactly OK. Do not modify any files. (cancel)";
    const cancelSubmit = await submitPlan(submitParams("client-real-cancel", executed[0]?.providerId || requested[0], content));
    const cancelled = await app.store.requestRunSubmissionCancellation(cancelSubmit.submissionId);
    assert.equal(cancelled.status, "CANCELLED");
    cases.push({ id: "queued-cancel", status: "CANCELLED" });

    // A stale claim is quarantined by the real reconciler and never redispatched.
    const recoverContent = "Reply with exactly OK. Do not modify any files. (recover)";
    const recoverSubmit = await submitPlan(submitParams("client-real-recover", executed[0]?.providerId || requested[0], recoverContent));
    await app.store.claimRunSubmission(recoverSubmit.submissionId,
      { workerId: "worker-real-died", leaseMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const reconcile = spawnSync(process.execPath,
      [cli, "runs", "reconcile", "--project-path", root, "--apply"], {
        cwd: root, encoding: "utf8", timeout: 60000
      });
    assert.equal(reconcile.status, 0, reconcile.stderr);
    const recovered = await app.store.getRunSubmission(recoverSubmit.submissionId);
    assert.equal(recovered.status, "RECONCILIATION_REQUIRED");
    cases.push({ id: "stale-claim-recovery", status: "RECONCILIATION_REQUIRED" });
  }

  const evidence = {
    schemaVersion: 1,
    issue: 48,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      os: `${os.type()} ${os.release()}`,
      node: process.version,
      providerBinaries: Object.fromEntries(cases
        .filter((item) => item.providerId)
        .map((item) => [item.providerId, item.version]))
    },
    cases,
    totals: {
      requested: requested.length,
      executed: executed.length,
      notInstalled: missing.length
    },
    missingProviders: missing.map((item) => item.providerId),
    verdict: executed.length === 0 ? "NOT_EXECUTED"
      : missing.length === 0 ? "PASS" : "PARTIAL"
  };
  const evidencePath = process.env.MAESTRO_REAL_PROVIDER_EVIDENCE ||
    path.join(os.tmpdir(), `maestro-real-provider-evidence-${Date.now()}.json`);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log(`real-provider evidence: ${evidencePath}`);
  console.log(JSON.stringify(evidence.totals));
  assert.ok(executed.length > 0, "no real provider executed; certification did not happen");
});