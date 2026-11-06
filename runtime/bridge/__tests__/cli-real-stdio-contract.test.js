"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const cli = path.resolve(__dirname, "../../../bin/orquestrador-maestro.js");

test("installed CLI Bridge exposes canonical Nexus contract without dispatch or fake subscriptions", {
  timeout: 60000
}, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-cli-bridge-"));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Canonical project\nMaestro remains independent from Nexus.\n");
  const child = spawn(process.execPath, [cli, "bridge", "--stdio", "--project-path", root], {
    cwd: root,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      ORQUESTRADOR_MAESTRO_BRIDGE_MEMORY_WRITE: "0"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const messages = [];
  const errors = [];
  reader.on("line", (line) => {
    try { messages.push(JSON.parse(line)); }
    catch { errors.push("Non-JSON stdout: " + line.slice(0, 120)); }
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk).slice(0, 500);
    if (stderr.length > 1500) stderr = stderr.slice(-1500);
  });
  const exitPromise = new Promise((resolve) => child.once("close", resolve));
  t.after(async () => {
    reader.close();
    if (child.exitCode === null) child.kill();
    await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 2000))]);
    fs.rmSync(root, { force: true, recursive: true });
  });

  async function rpc(id, method, params = {}) {
    const line = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    assert.equal(child.exitCode, null, "Maestro Bridge exited early: " + stderr);
    child.stdin.write(line);
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline) {
      if (errors.length) throw new Error(errors[0]);
      const index = messages.findIndex((row) => row.id === id);
      if (index >= 0) return messages.splice(index, 1)[0];
      if (child.exitCode !== null) throw new Error("Bridge exited early: " + stderr);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Maestro Bridge timeout " + method + ": " + stderr);
  }

  const init = await rpc(1, "initialize", { protocolVersion: 1 });
  assert.equal(init.error, undefined, JSON.stringify(init.error));
  const capabilities = init.result.capabilities;
  assert.equal(capabilities.projectContext, true);
  assert.equal(capabilities.plansValidate, true);
  assert.equal(capabilities.projectCompose, true);
  assert.equal(capabilities.plansRoutePreview, true);
  assert.equal(capabilities.runsObserve, true);
  assert.equal(capabilities.runsSubmissionsRead, true);
  assert.equal(capabilities.runsSubmissionsPoll, true);
  assert.equal(capabilities.runsSubmissionsCancel, true);
  assert.equal(capabilities.runsSubmit, false, "an observer must not advertise an executor");
  assert.equal(capabilities.memory.read, true);
  assert.equal(capabilities.memory.write, false);
  assert.equal(capabilities.subscriptions, false);

  const project = await rpc(2, "project.context", { projectPath: root, maxChars: 2500 });
  assert.equal(project.error, undefined, JSON.stringify(project.error));
  assert.equal(project.result.authority, "MAESTRO");
  assert.match(project.result.context.content, /Maestro remains independent/);
  assert.match(project.result.context.manifest.contentDigest, /^[0-9a-f]{64}$/);

  const invalid = await rpc(3, "plans.routePreview", {
    projectPath: root,
    artifact: { id: "artifact", version: 1, content: "Short request", sha256: "0".repeat(64) },
    proposal: { tasks: [{ id: "task", title: "Validate API", objective: "Run safe preflight",
      acceptanceCriteria: ["Reject invalid input"] }] },
    assignments: [{ taskId: "task", providerId: "agy", model: "default", sandbox: "none", worktreePath: root }]
  });
  assert.equal(invalid.error?.code, -32602, "bad SHA must fail before provider invocation");

  const unavailable = await rpc(4, "runs.observe", { runId: "nonexistent-run" });
  assert.equal(unavailable.error, undefined, JSON.stringify(unavailable.error));
  assert.equal(unavailable.result, null);

  const unregisteredPoll = await rpc(6, "runs.submissions.poll", { limit: 10 });
  assert.equal(unregisteredPoll.error?.code, -32602,
    "unregistered roots must fail closed rather than acquiring foreign submissions");
  const registered = await rpc(9, "projects.register", { projectPath: root });
  assert.equal(registered.error, undefined, JSON.stringify(registered.error));
  const idlePoll = await rpc(10, "runs.submissions.poll", { limit: 10 });
  assert.equal(idlePoll.error, undefined, JSON.stringify(idlePoll.error));
  assert.equal(idlePoll.result.delivery, "SNAPSHOT_POLL");
  assert.equal(idlePoll.result.total, 0);
  assert.equal(idlePoll.result.changed, true);
  assert.equal(idlePoll.result.replayable, false);
  const invalidCancel = await rpc(7, "runs.submissions.cancel", { submissionId: "../invalid" });
  assert.equal(invalidCancel.error?.code, -32602);
  const unavailableSubmit = await rpc(8, "runs.submit", {});
  assert.equal(unavailableSubmit.error?.code, -32601);

  const subscriptions = await rpc(5, "events.subscribe", {});
  assert.equal(subscriptions.error?.code, -32601);

  child.stdin.end();
  const exitCode = await Promise.race([
    exitPromise,
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000))
  ]);
  assert.equal(exitCode, 0, "stdio process did not exit cleanly");
});
