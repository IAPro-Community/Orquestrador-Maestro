"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");
const { validatePlanPreview } = require("./plan-validation");

const PROVIDER_ID = /^[a-z][a-z0-9._:-]{0,63}$/;
const MODEL_ID = /^[a-zA-Z0-9._:/+-]{1,128}$/;
const TASK_ID = /^[a-zA-Z0-9._:-]{1,128}$/;
const SANDBOX = new Set(["none", "enabled", "read-only", "workspace-write"]);
const MAX_TASKS = 32;

function invalid(message) {
  const error = new TypeError(message);
  error.code = -32602;
  return error;
}
function isAncestor(tasks, ancestorId, dependentId) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set();
  const pending = [dependentId];
  while (pending.length) {
    const next = pending.pop();
    if (next === ancestorId) return true;
    if (visited.has(next)) continue;
    visited.add(next);
    pending.push(...(byId.get(next)?.dependsOn || []));
  }
  return false;
}
function mutuallyIndependent(tasks, a, b) {
  return !isAncestor(tasks, a, b) && !isAncestor(tasks, b, a);
}
function validateWorktree(projectRoot, workspacePath, canonical) {
  if (typeof workspacePath !== "string" || !workspacePath.trim() ||
      workspacePath.length > 4096 || workspacePath.includes("\0")) {
    throw invalid("Each delegated task requires an explicit bounded worktreePath");
  }
  const absolute = path.resolve(workspacePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw invalid("Worktree does not exist");
  }
  const scope = resolveGitContext(absolute);
  if (scope.vcs !== "git" || !scope.workspaceId || !scope.repositoryId ||
      scope.repositoryId !== canonical.repositoryId ||
      !scope.commonGitDir || !canonical.commonGitDir ||
      fs.realpathSync(scope.commonGitDir) !== fs.realpathSync(canonical.commonGitDir)) {
    throw invalid("Worktree does not belong to the active Maestro Git repository");
  }
  if (scope.detached || !scope.branch || !scope.headCommit || scope.headCommit === "unknown") {
    throw invalid("Worktree must have an identifiable branch and HEAD commit");
  }
  return Object.freeze({ workspaceId: scope.workspaceId, branch: scope.branch, headCommit: scope.headCommit });
}
function requiredAssignment(raw, id) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalid("Assignment for task " + id + " must be an object");
  }
  const allowed = new Set(["taskId", "providerId", "model", "worktreePath", "sandbox"]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw invalid("Unexpected assignment field: " + key);
  }
  if (raw.taskId !== id || !TASK_ID.test(id) || typeof raw.providerId !== "string" || !PROVIDER_ID.test(raw.providerId)) {
    throw invalid("Task assignment has an unknown ID or provider");
  }
  if (raw.model !== undefined && (typeof raw.model !== "string" ||
      !MODEL_ID.test(raw.model) || raw.model.includes(".."))) {
    throw invalid("Unsafe assignment model identifier");
  }
  if (!SANDBOX.has(raw.sandbox)) {
    throw invalid("Each assignment must select sandbox mode explicitly");
  }
  return raw;
}
function supportedSandbox(adapter, caps, requested) {
  if (requested === "none") return true;
  if (requested === "enabled") return adapter.id === "agy" && caps.sandboxControl === true;
  if (requested === "read-only" || requested === "workspace-write") {
    return adapter.id === "codex" && caps.sandboxControl === true;
  }
  return false;
}

/**
 * Preflight only; never persists tasks or runs, invokes providers, or silently
 * changes the user's per-task provider choice. The runtime that owns execution
 * must independently check these constraints again at admission/dispatch.
 */
function createRoutePreview({ projectRoot, providerRegistry }) {
  const root = path.resolve(projectRoot || process.cwd());
  async function preview(params = {}) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw invalid("Route preview parameters must be an object");
    }
    const allowed = new Set(["projectPath", "artifact", "proposal", "assignments"]);
    for (const key of Object.keys(params)) {
      if (!allowed.has(key)) throw invalid("Unknown route preview parameter: " + key);
    }
    const plan = validatePlanPreview({
      projectPath: params.projectPath, artifact: params.artifact, proposal: params.proposal
    }, root);
    if (!plan.validation.valid || !Array.isArray(plan.tasks)) {
      return Object.freeze({
        schemaVersion: 1, authority: "MAESTRO",
        previewOnly: true, executable: false, approvalRequired: true,
        ready: false, plan, assignments: [],
        blockers: [{ code: "INVALID_CANONICAL_PLAN", message: "DAG must pass Maestro validation" }]
      });
    }
    if (!Array.isArray(params.assignments) || params.assignments.length !== plan.tasks.length ||
        params.assignments.length > MAX_TASKS) {
      throw invalid("Every task requires exactly one explicitly selected provider");
    }
    const canonical = resolveGitContext(root);
    if (canonical.vcs !== "git" || !canonical.repositoryId || !canonical.commonGitDir) {
      throw invalid("Maestro routing requires a real Git repository");
    }
    const tasks = plan.tasks;
    const IDs = new Set(tasks.map((t) => t.id));
    const seen = new Set();
    const requests = [];
    for (const raw of params.assignments) {
      if (!raw || typeof raw.taskId !== "string" || !IDs.has(raw.taskId) || seen.has(raw.taskId)) {
        throw invalid("Duplicate or unknown task assignment");
      }
      seen.add(raw.taskId);
      const assignment = requiredAssignment(raw, raw.taskId);
      requests.push({
        taskId: assignment.taskId, providerId: assignment.providerId,
        model: assignment.model || "default", sandbox: assignment.sandbox,
        ...validateWorktree(root, assignment.worktreePath, canonical)
      });
    }
    const blockers = [];
    for (let i = 0; i < requests.length; i++) {
      for (let j = i + 1; j < requests.length; j++) {
        if (requests[i].workspaceId === requests[j].workspaceId &&
            mutuallyIndependent(tasks, requests[i].taskId, requests[j].taskId)) {
          blockers.push({
            code: "SHARED_WORKTREE_CONFLICT",
            taskIds: [requests[i].taskId, requests[j].taskId],
            message: "Independent tasks must use distinct worktrees"
          });
        }
      }
    }
    const statuses = await Promise.all(requests.map(async (assignment) => {
      const adapter = providerRegistry?.get?.(assignment.providerId) || null;
      if (!adapter) return { ...assignment, status: "BLOCKED", code: "PROVIDER_NOT_REGISTERED" };
      let installed = false, capabilities = {};
      try {
        const installedInfo = await adapter.detect();
        installed = installedInfo?.installed === true;
        capabilities = await adapter.capabilities();
      } catch {
        installed = false;
      }
      const allowedMode = supportedSandbox(adapter, capabilities || {}, assignment.sandbox);
      return Object.freeze({
        ...assignment,
        status: installed && allowedMode ? "READY_FOR_REVIEW" : "BLOCKED",
        code: !installed ? "PROVIDER_UNAVAILABLE" : !allowedMode ? "SANDBOX_NOT_SUPPORTED" : null
      });
    }));
    for (const row of statuses) {
      if (row.code) blockers.push({ code: row.code, taskId: row.taskId, providerId: row.providerId });
    }
    return Object.freeze({
      schemaVersion: 1, authority: "MAESTRO",
      previewOnly: true, executable: false, approvalRequired: true,
      ready: blockers.length === 0, plan, assignments: statuses, blockers
    });
  }
  return Object.freeze({ preview });
}
module.exports = { createRoutePreview };
