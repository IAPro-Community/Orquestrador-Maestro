"use strict";

/**
 * End-to-end over REAL CLI processes: Bridge stdio admission, durable queue,
 * a separate `maestro runs worker` process claiming with lease/fencing, a
 * provider executed as a real subprocess (shimmed executable standing in for
 * a provider CLI), and a second Bridge client observing the same queue.
 *
 * This is NOT provider homologation: AGY/OpenCode/Codex/Claude real binaries
 * are still pending certification (#48/#185). The provider here is a shim
 * executable proving the production dispatch path only.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const test = require("node:test");
const readline = require("node:readline");
const { MaestroApplication } = require("../runtime/application/maestro-application");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "orquestrador-maestro.js");
const digest = (value) => require("node:crypto").createHash("sha256").update(value).digest("hex");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

const providerShimSource = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const dir = process.env.SHIM_MARK_DIR || '.';",
  "fs.writeFileSync(path.join(dir, 'shim-executed.marker'), String(process.pid));",
  "process.stdout.write(JSON.stringify({ part: { type: 'text', text: 'shim provider output' } }) + '\\n');",
  "process.exit(0);"
].join("\n");

function shimProviderBin(t, workspaceRoot) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-shim-provider-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  if (process.platform === "win32") {
    // Keep the provider invocation shell-free: a renamed Node executable
    // starts the committed `run` fixture from the project working directory.
    // Windows cannot directly spawn npm-style .cmd shims with shell:false.
    fs.copyFileSync(process.execPath, path.join(bin, "opencode.exe"));
    fs.writeFileSync(path.join(workspaceRoot, "run"), providerShimSource);
  } else {
    fs.writeFileSync(path.join(bin, "opencode"), `#!/usr/bin/env node\n${providerShimSource}\n`, { mode: 0o755 });
  }
  return bin;
}

function waitForClose(closeEvent, timeoutMs) {
  let timer;
  return Promise.race([
    closeEvent,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}

function startBridge(root, extraEnv = {}) {
  const child = spawn(process.execPath, [cli, "bridge", "--stdio", "--project-path", root], {
    cwd: root, shell: false, windowsHide: true,
    env: { ...process.env, ORQUESTRADOR_MAESTRO_BRIDGE_MEMORY_WRITE: "0", ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const closeEvent = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let nextId = 1;
  const waiting = new Map();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-400); });
  reader.on("line", (line) => {
    let response;
    try { response = JSON.parse(line); } catch { return; }
    const pending = waiting.get(response.id);
    if (!pending) return;
    waiting.delete(response.id);
    clearTimeout(pending.timer);
    pending.resolve(response);
  });
  let closePromise;
  const close = () => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      for (const { reject, timer } of waiting.values()) {
        clearTimeout(timer);
        reject(new Error("Maestro bridge was closed"));
      }
      waiting.clear();

      if (child.exitCode === null && child.signalCode === null && child.stdin.writable) child.stdin.end();
      let result = await waitForClose(closeEvent, 5000);
      if (!result && child.exitCode === null && child.signalCode === null) {
        child.kill();
        result = await waitForClose(closeEvent, 5000);
      }
      reader.close();
      if (!result) throw new Error("Maestro bridge did not close after stdin EOF and termination");
      if (result.code !== 0 || result.signal) {
        throw new Error(`Maestro bridge exited unexpectedly (code=${result.code}, signal=${result.signal})`);
      }
      return result;
    })();
    return closePromise;
  };
  return {
    close,
    rpc(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        if (child.exitCode !== null || !child.stdin.writable) {
          reject(new Error("Maestro bridge exited: " + stderr)); return;
        }
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new Error("Maestro RPC timed out: " + method + " " + stderr));
        }, 20000);
        waiting.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    }
  };
}

function submitParams(clientKey, content) {
  return {
    clientKey,
    artifact: { id: "artifact-e2e-001", version: 1, content, sha256: digest(content) },
    approvedModelUse: true,
    plan: {
      tasks: [{
        id: "task-e2e-shim-001", title: "Execute shim task",
        objective: "Run the provider shim once in the project worktree",
        dependsOn: [], acceptanceCriteria: ["shim provider output recorded"]
      }]
    },
    assignments: [{ taskId: "task-e2e-shim-001", providerId: "opencode", sandbox: "none" }],
    approval: { decision: "approved", approvedBy: "e2e-operator" }
  };
}

test("durable admission over real CLI, executed by a separate worker process, observed by a second client", {
  timeout: 120000
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-worker-e2e-"));
  const bridges = [];
  t.after(async () => {
    const closeResults = await Promise.allSettled(bridges.map((bridge) => bridge.close()));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    const failure = closeResults.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  });
  fs.writeFileSync(path.join(root, "README.md"), "e2e base\n");
  const shimBin = shimProviderBin(t, root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "E2E");
  git(root, "config", "user.email", "e2e@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  const env = { PATH: `${shimBin}${path.delimiter}${process.env.PATH}`, SHIM_MARK_DIR: root };
  const content = submitParams("client-e2e-001", "x").artifact.content;

  const app = new MaestroApplication({ projectRoot: root });
  const registered = await app.registerProject({ projectPath: root });

  const bridge = startBridge(root, env);
  const observer = startBridge(root, env);
  bridges.push(bridge, observer);

  const init = await bridge.rpc("initialize", { protocolVersion: 1 });
  assert.equal(init.error, undefined);
  assert.equal(init.result.capabilities.runsSubmit, true,
    "the real CLI bridge must advertise durable admission");

  const submit = await bridge.rpc("runs.submit", submitParams("client-e2e-001", content));
  assert.equal(submit.error, undefined, JSON.stringify(submit.error));
  assert.equal(submit.result.status, "PENDING_WORKER");
  assert.equal(submit.result.replayed, false);

  const replay = await bridge.rpc("runs.submit", submitParams("client-e2e-001", content));
  assert.equal(replay.error, undefined);
  assert.equal(replay.result.replayed, true);
  assert.equal(replay.result.submissionId, submit.result.submissionId);

  // A second, independent Bridge client observes the same queue.
  const polled = await observer.rpc("runs.submissions.poll", { limit: 5 });
  assert.equal(polled.error, undefined);
  assert.equal(polled.result.total, 1);
  assert.equal(polled.result.submissions[0].status, "PENDING_WORKER");
  assert.equal(polled.result.submissions[0].submissionId, submit.result.submissionId);

  // Separate worker process claims and executes the queued submission.
  const worker = spawn(process.execPath,
    [cli, "runs", "worker", "--project-path", root, "--once", "--interval", "50"], {
      cwd: root, shell: false, windowsHide: true,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
  const workerExit = new Promise((resolve) => worker.once("exit", resolve));
  let workerStdout = "";
  worker.stdout.on("data", (chunk) => { workerStdout += String(chunk); });
  let workerTimer;
  const workerTimeout = new Promise((_, reject) => {
    workerTimer = setTimeout(() => reject(new Error("worker process timed out")), 90000);
  });
  const workerCode = await Promise.race([workerExit, workerTimeout]).finally(() => clearTimeout(workerTimer));
  assert.equal(workerCode, 0, "worker exited cleanly: " + workerStdout.slice(-400));
  assert.match(workerStdout, /"submissionStatus":\s*"COMPLETED"/);

  assert.ok(fs.existsSync(path.join(root, "shim-executed.marker")),
    "the provider subprocess must have executed for real");

  const observed = await observer.rpc("runs.submissions.poll", { limit: 5 });
  const row = observed.result.submissions.find((item) => item.submissionId === submit.result.submissionId);
  assert.ok(row, "the same submission must be visible to the second client");
  assert.equal(row.status, "COMPLETED");
  assert.match(row.runId, /^run-/);

  // Cancellation of a fresh queued submission is immediate and worker-free.
  const secondContent = submitParams("client-e2e-cancel", "y").artifact.content;
  git(root, "commit", "-q", "--allow-empty", "-m", "advance head");
  const secondSubmit = await bridge.rpc("runs.submit", submitParams("client-e2e-cancel", secondContent));
  assert.equal(secondSubmit.error, undefined, JSON.stringify(secondSubmit.error));
  const cancel = await bridge.rpc("runs.submissions.cancel", { submissionId: secondSubmit.result.submissionId });
  assert.equal(cancel.error, undefined);
  assert.equal(cancel.result.status, "CANCELLED");
  assert.equal(registered.id.length > 0, true);
});

test("expired worker lease is quarantined by the real CLI reconciler, never redispatched", {
  timeout: 120000
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-reconcile-e2e-"));
  const bridges = [];
  t.after(async () => {
    const closeResults = await Promise.allSettled(bridges.map((bridge) => bridge.close()));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    const failure = closeResults.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  });
  fs.writeFileSync(path.join(root, "README.md"), "reconcile base\n");
  git(root, "init", "-q");
  git(root, "config", "user.name", "E2E");
  git(root, "config", "user.email", "e2e@example.invalid");
  git(root, "add", "README.md");
  git(root, "commit", "-qm", "base");
  const app = new MaestroApplication({ projectRoot: root });
  const registered = await app.registerProject({ projectPath: root });

  const bridge = startBridge(root);
  bridges.push(bridge);
  const content = "reconcile prompt";
  const submit = await bridge.rpc("runs.submit", submitParams("client-reconcile-001", content));
  assert.equal(submit.error, undefined);
  const submissionId = submit.result.submissionId;

  // A worker claims and dies without finishing: forge a stale claim via a
  // short lease through the store directly (the dispatch never happened).
  const claim = await app.store.claimRunSubmission(submissionId,
    { workerId: "worker-e2e-died-001", leaseMs: 1000 });
  assert.ok(claim);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const report = execFileSync(process.execPath,
    [cli, "runs", "reconcile", "--project-path", root, "--apply"], {
      cwd: root, encoding: "utf8", stdio: "pipe", timeout: 30000
    });
  assert.match(report, /RECONCILIATION_REQUIRED/);
  const row = await app.store.getRunSubmission(submissionId);
  assert.equal(row.status, "RECONCILIATION_REQUIRED");
  assert.equal(row.workerId, null);
  // A reconciled submission is never re-dispatched automatically.
  const worker = spawn(process.execPath,
    [cli, "runs", "worker", "--project-path", root, "--once", "--interval", "50"], {
      cwd: root, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
    });
  await new Promise((resolve) => worker.on("exit", resolve));
  assert.equal((await app.store.getRunSubmission(submissionId)).status, "RECONCILIATION_REQUIRED");
});
