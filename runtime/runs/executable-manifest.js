"use strict";

const crypto = require("node:crypto");
const { bad, validateID, validateDigest } = require("./submission-admission");

const PROVIDERS = new Set(["agy", "opencode", "codex", "claude"]);
const SANDBOXES = new Set(["none", "enabled", "read-only", "workspace-write"]);
const TASK_KEYS = new Set([
  "taskId", "dependsOn", "providerId", "modelId", "workspaceFingerprint",
  "headCommit", "branch", "promptDigest", "acceptanceDigest", "sandbox",
  "maxAttempts", "maxDurationMs", "maxCostUSD"
]);
const ROOT_KEYS = new Set(["schemaVersion", "projectId", "planDigest", "artifactDigest", "maxCostUSD", "tasks"]);

function record(value, label, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !fields.has(key))) {
    throw bad(label + " must have only the declared fields", "INVALID_EXECUTABLE_MANIFEST");
  }
  return value;
}
function bounded(value, name, regex, maxLength = 128) {
  if (typeof value !== "string" || value.length > maxLength || !regex.test(value)) {
    throw bad("invalid " + name, "INVALID_EXECUTABLE_MANIFEST");
  }
  return value;
}
function budget(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw bad(name + " must be a finite USD limit in [0, 100]", "INVALID_EXECUTABLE_MANIFEST");
  }
  return value;
}
function canonicalTask(input) {
  record(input, "task", TASK_KEYS);
  const taskId = bounded(input.taskId, "taskId", /^[A-Za-z0-9._:-]{1,128}$/);
  if (!Array.isArray(input.dependsOn) || input.dependsOn.length > 32) {
    throw bad("dependsOn must be a bounded array", "INVALID_EXECUTABLE_MANIFEST");
  }
  const dependsOn = input.dependsOn.map((dep) => bounded(dep, "dependency", /^[A-Za-z0-9._:-]{1,128}$/)).sort();
  if (new Set(dependsOn).size !== dependsOn.length || dependsOn.includes(taskId)) {
    throw bad("duplicate or self dependency", "INVALID_EXECUTABLE_MANIFEST");
  }
  const providerId = bounded(input.providerId, "providerId", /^[a-z][a-z0-9-]{1,31}$/);
  if (!PROVIDERS.has(providerId)) throw bad("unsupported manifest provider", "INVALID_EXECUTABLE_MANIFEST");
  const modelId = bounded(input.modelId, "modelId", /^[A-Za-z0-9._:/+-]{1,128}$/);
  const branch = bounded(input.branch, "branch", /^[A-Za-z0-9._/-]{1,200}$/, 200);
  if (branch.includes("..") || branch.startsWith("/") || branch.endsWith("/") || branch.includes("//")) {
    throw bad("invalid Git branch", "INVALID_EXECUTABLE_MANIFEST");
  }
  const headCommit = bounded(input.headCommit, "headCommit", /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
  const sandbox = input.sandbox;
  if (!SANDBOXES.has(sandbox)) throw bad("sandbox mode is required", "INVALID_EXECUTABLE_MANIFEST");
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 5 ||
      !Number.isInteger(input.maxDurationMs) || input.maxDurationMs < 1000 ||
      input.maxDurationMs > 7_200_000) {
    throw bad("invalid task execution limits", "INVALID_EXECUTABLE_MANIFEST");
  }
  return Object.freeze({
    taskId, dependsOn: Object.freeze(dependsOn), providerId, modelId,
    workspaceFingerprint: validateDigest(input.workspaceFingerprint, "workspaceFingerprint"),
    headCommit, branch,
    promptDigest: validateDigest(input.promptDigest, "promptDigest"),
    acceptanceDigest: validateDigest(input.acceptanceDigest, "acceptanceDigest"),
    sandbox, maxAttempts: input.maxAttempts, maxDurationMs: input.maxDurationMs,
    maxCostUSD: budget(input.maxCostUSD, "task.maxCostUSD")
  });
}
function dependsOn(tasks, start, ancestor) {
  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  const pending = [...byId.get(start).dependsOn];
  const seen = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (id === ancestor) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...byId.get(id).dependsOn);
  }
  return false;
}
function normalizeExecutableManifest(input) {
  record(input, "manifest", ROOT_KEYS);
  if (input.schemaVersion !== 1 || !Array.isArray(input.tasks) ||
      input.tasks.length < 1 || input.tasks.length > 32) {
    throw bad("manifest version 1 requires 1..32 tasks", "INVALID_EXECUTABLE_MANIFEST");
  }
  const tasks = input.tasks.map(canonicalTask).sort((a, b) => a.taskId.localeCompare(b.taskId, "en"));
  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  if (byId.size !== tasks.length) throw bad("duplicate task ID", "INVALID_EXECUTABLE_MANIFEST");
  for (const task of tasks) {
    if (task.dependsOn.some((id) => !byId.has(id)) || dependsOn(tasks, task.taskId, task.taskId)) {
      throw bad("missing dependency or cyclic DAG", "INVALID_EXECUTABLE_MANIFEST");
    }
  }
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      if (tasks[i].workspaceFingerprint === tasks[j].workspaceFingerprint &&
          !dependsOn(tasks, tasks[i].taskId, tasks[j].taskId) &&
          !dependsOn(tasks, tasks[j].taskId, tasks[i].taskId)) {
        throw bad("independent tasks cannot write the same worktree", "MANIFEST_WORKTREE_CONFLICT");
      }
    }
  }
  const total = budget(input.maxCostUSD, "maxCostUSD");
  if (tasks.reduce((sum, task) => sum + task.maxCostUSD, 0) > total + 0.0000001) {
    throw bad("task budgets exceed the approved total", "MANIFEST_BUDGET_EXCEEDED");
  }
  const payload = {
    schemaVersion: 1,
    projectId: validateID(input.projectId, "projectId"),
    planDigest: validateDigest(input.planDigest, "planDigest"),
    artifactDigest: validateDigest(input.artifactDigest, "artifactDigest"),
    maxCostUSD: total,
    tasks: Object.freeze(tasks)
  };
  const digest = crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  return Object.freeze({ id: "manifest-" + digest, digest, ...payload });
}
function validateStoredExecutableManifest(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw bad("malformed stored executable manifest", "RUN_STORE_CORRUPTED");
  }
  const { id, digest, ...payload } = row;
  let canonical;
  try { canonical = normalizeExecutableManifest(payload); }
  catch { throw bad("invalid stored executable manifest", "RUN_STORE_CORRUPTED"); }
  if (id !== canonical.id || digest !== canonical.digest || JSON.stringify(row) !== JSON.stringify(canonical)) {
    throw bad("executable manifest digest mismatch", "RUN_STORE_CORRUPTED");
  }
  return canonical;
}

module.exports = { normalizeExecutableManifest, validateStoredExecutableManifest };
