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

function startBridge(root, t) {
  const child = spawn(process.execPath, [cli, "bridge", "--stdio", "--project-path", root], {
    cwd: root, shell: false, windowsHide: true,
    env: { ...process.env, ORQUESTRADOR_MAESTRO_BRIDGE_MEMORY_WRITE: "0" },
    stdio: ["pipe", "pipe", "pipe"]
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
  const close = () => {
    reader.close();
    if (!child.killed && child.exitCode === null) child.kill();
    for (const { reject, timer } of waiting.values()) {
      clearTimeout(timer);
      reject(new Error("Maestro bridge was closed"));
    }
    waiting.clear();
  };
  t.after(close);
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
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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
  const clientA = startBridge(root, t);
  const clientB = startBridge(root, t);
  const [initA, initB] = await Promise.all([
    clientA.rpc("initialize", { protocolVersion: 1 }),
    clientB.rpc("initialize", { protocolVersion: 1 })
  ]);
  for (const response of [initA, initB]) {
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    assert.equal(response.result.capabilities.runsSubmissionsRead, true);
    assert.equal(response.result.capabilities.runsSubmissionsPoll, true);
    assert.equal(response.result.capabilities.runsSubmissionsCancel, true);
    assert.equal(response.result.capabilities.runsSubmit, false,
      "observability cannot imply an executable run worker");
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

  clientB.close();
  const restarted = startBridge(root, t);
  const afterRestart = await restarted.rpc("runs.submissions.poll", {
    limit: 5, cursor: changed.result.cursor
  });
  assert.equal(afterRestart.error, undefined, JSON.stringify(afterRestart.error));
  assert.equal(afterRestart.result.changed, false, "snapshot cursor must survive Bridge restart");
  assert.equal(afterRestart.result.total, 1);
  assert.deepEqual(afterRestart.result.submissions, []);
});

