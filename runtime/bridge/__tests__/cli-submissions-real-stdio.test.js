"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { MaestroApplication } = require("../../application/maestro-application");

const cli = path.resolve(__dirname, "../../../bin/orquestrador-maestro.js");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function waitForClose(closeEvent, timeoutMs) {
  let timer;
  return Promise.race([
    closeEvent,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

function startBridge(root) {
  const child = spawn(process.execPath, [cli, "bridge", "--stdio", "--project-path", root], {
    cwd: root, shell: false, windowsHide: true,
    env: { ...process.env, ORQUESTRADOR_MAESTRO_BRIDGE_MEMORY_WRITE: "0" },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const closeEvent = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const waiting = new Map();
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-500);
  });
  reader.on("line", (line) => {
    let response;
    try { response = JSON.parse(line); }
    catch { return; }
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

      if (child.exitCode === null && child.signalCode === null && child.stdin.writable) {
        child.stdin.end();
      }
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
        }, 10000);
        waiting.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    }
  };
}

test("real CLI bridges observe one durable submission across processes and restart without redispatch", {
  timeout: 60000
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-stdio-replay-"));
  const clients = [];
  t.after(async () => {
    const closeResults = await Promise.allSettled(clients.map((client) => client.close()));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    const failure = closeResults.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Durable project context\n");
  const foreign = path.join(root, "unrelated-checkout");
  fs.mkdirSync(foreign);
  const app = new MaestroApplication({ projectRoot: root });
  const registered = await app.registerProject({ projectPath: root });
  await app.store.createProject({ id: "project-foreign-001", path: foreign });

  const submission = (await app.store.admitRunSubmission({
    projectId: registered.id, clientKey: "client-durable-001",
    planDigest: digest("plan"), artifactDigest: digest("artifact"),
    approvalDigest: digest("trusted-receipt"), workspaceFingerprint: digest("worktree"),
    taskCount: 1, providers: ["opencode"], maxAttempts: 1,
    maxDurationMs: 10000, maxCostUSD: 0
  })).submission;
  await app.store.admitRunSubmission({
    projectId: "project-foreign-001", clientKey: "client-foreign-001",
    planDigest: digest("foreign-plan"), artifactDigest: digest("foreign-artifact"),
    approvalDigest: digest("foreign-receipt"), workspaceFingerprint: digest("other-worktree"),
    taskCount: 1, providers: ["agy"], maxAttempts: 1,
    maxDurationMs: 10000, maxCostUSD: 0
  });
  const clientA = startBridge(root);
  const clientB = startBridge(root);
  clients.push(clientA, clientB);
  const [initA, initB] = await Promise.all([
    clientA.rpc("initialize", { protocolVersion: 1 }),
    clientB.rpc("initialize", { protocolVersion: 1 })
  ]);
  for (const response of [initA, initB]) {
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    assert.equal(response.result.capabilities.runsSubmissionsRead, true);
    assert.equal(response.result.capabilities.runsSubmissionsPoll, true);
    assert.equal(response.result.capabilities.runsSubmissionsCancel, true);
    // runs.submit admits durably (manifest + receipt + ACK); it never
    // executes. Queued submissions stay observably PENDING_WORKER until the
    // `maestro runs worker` process claims them.
    assert.equal(response.result.capabilities.runsSubmit, true);
  }
  const first = await clientA.rpc("runs.submissions.poll", { limit: 5 });
  assert.equal(first.error, undefined, JSON.stringify(first.error));
  assert.equal(first.result.total, 1, "foreign project must not leak");
  assert.equal(first.result.submissions[0].submissionId, submission.id);
  assert.equal(first.result.submissions[0].status, "PENDING_WORKER");
  const redacted = JSON.stringify(first);
  assert.equal(redacted.includes("trusted-receipt"), false);
  assert.equal(redacted.includes("client-durable-001"), false);

  const unchanged = await clientB.rpc("runs.submissions.poll", { limit: 5, cursor: first.result.cursor });
  assert.equal(unchanged.result.changed, false);
  assert.deepEqual(unchanged.result.submissions, []);
  const cancelled = await clientB.rpc("runs.submissions.cancel", { submissionId: submission.id });
  assert.equal(cancelled.error, undefined, JSON.stringify(cancelled.error));
  assert.equal(cancelled.result.status, "CANCELLED");
  const changed = await clientA.rpc("runs.submissions.poll", { limit: 5, cursor: first.result.cursor });
  assert.equal(changed.result.changed, true);
  assert.equal(changed.result.submissions[0].status, "CANCELLED");
  assert.notEqual(changed.result.cursor, first.result.cursor);
  assert.deepEqual(await app.store.listRuns({}), [], "poll/cancel cannot dispatch a Run");

  const clientBClose = await clientB.close();
  assert.equal(clientBClose.code, 0, "Bridge should exit cleanly after stdin EOF");
  const restarted = startBridge(root);
  clients.push(restarted);
  const afterRestart = await restarted.rpc("runs.submissions.poll", {
    limit: 5, cursor: changed.result.cursor
  });
  assert.equal(afterRestart.error, undefined, JSON.stringify(afterRestart.error));
  assert.equal(afterRestart.result.changed, false, "snapshot cursor must survive Bridge restart");
  assert.equal(afterRestart.result.total, 1);
  assert.deepEqual(afterRestart.result.submissions, []);
});

