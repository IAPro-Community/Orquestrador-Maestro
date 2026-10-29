"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { Memory } = require("../../orquestrador/bin/memory");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");
const { resolveObservationScope } = require("../../orquestrador/lib/visibility");
const { withLock, getLockPath } = require("../../orquestrador/lib/lock");

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const TYPES = new Set(require("../../orquestrador/schemas/MEMORY_SCHEMA.json").properties.type.enum);
const LEVELS = new Set(["repository", "branch", "workspace", "task"]);

function invalid(message) {
  const error = new Error(message);
  error.code = -32602;
  return error;
}

// This adapter is only a guarded entry point into Maestro's existing
// Memory.record. It creates no observation index, semantic store or scheduler.
function createGuardedMemoryWriter({ projectRoot, memory = new Memory(), enabled = false }) {
  const root = path.resolve(projectRoot || process.cwd());

  function record(params = {}) {
    if (!enabled) {
      const error = new Error("Memory write requires explicit Maestro Bridge opt-in");
      error.code = -32601;
      throw error;
    }
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw invalid("params must be an object");
    }
    const allowed = new Set([
      "confirmed", "reason", "idempotencyKey", "type", "summary",
      "details", "scopeLevel", "taskId", "tags", "files", "projectPath"
    ]);
    for (const key of Object.keys(params)) {
      if (!allowed.has(key)) throw invalid(`unknown or forbidden memory write parameter: ${key}`);
    }
    if (params.confirmed !== true) throw invalid("explicit operator confirmation required");
    if (typeof params.reason !== "string" || params.reason.trim().length < 8 || params.reason.length > 200) {
      throw invalid("reason must be 8 to 200 characters");
    }
    if (params.projectPath !== undefined &&
      (typeof params.projectPath !== "string" || path.resolve(params.projectPath) !== root)) {
      throw invalid("projectPath must match Bridge project root");
    }
    if (typeof params.idempotencyKey !== "string" || !IDENTIFIER.test(params.idempotencyKey)) {
      throw invalid("idempotencyKey must be a stable 1-128 character identifier");
    }
    if (!TYPES.has(params.type)) throw invalid("unknown observation type");
    if (typeof params.summary !== "string" || params.summary.trim().length < 1 ||
      params.summary.length > 500) throw invalid("summary must be 1 to 500 characters");
    if (params.details !== undefined &&
      (typeof params.details !== "string" || params.details.length > 4000)) {
      throw invalid("details must be a string of at most 4000 characters");
    }
    if (!LEVELS.has(params.scopeLevel)) throw invalid("explicit scopeLevel is required");
    if (params.taskId !== undefined &&
      (typeof params.taskId !== "string" || !IDENTIFIER.test(params.taskId))) {
      throw invalid("invalid taskId");
    }
    if (params.scopeLevel === "task" && !params.taskId) {
      throw invalid("task scope requires taskId");
    }
    for (const name of ["tags", "files"]) {
      if (params[name] !== undefined &&
        (!Array.isArray(params[name]) || params[name].length > 16 ||
          params[name].some(item => typeof item !== "string" ||
            item.length === 0 || item.length > (name === "tags" ? 128 : 512)))) {
        throw invalid(`invalid or unbounded ${name}`);
      }
    }

    const context = resolveGitContext(root);
    if (context.vcs !== "git" || !context.repositoryId) {
      throw invalid("a resolved Git repository is required for canonical memory writes");
    }
    const scope = resolveObservationScope({
      type: params.type,
      gitContext: context,
      taskId: params.taskId || null,
      explicitScope: { level: params.scopeLevel }
    });
    if (!scope) throw invalid("requested scope is not valid in the active worktree");

    const normalized = {
      type: params.type,
      summary: params.summary.trim(),
      details: params.details || null,
      tags: params.tags || [],
      files: params.files || [],
      taskId: params.taskId || null,
      scope
    };
    // Bind the idempotency token to both content and the exact authoritative
    // scope, without persisting the operator's reason or any raw request body.
    const requestHash = crypto.createHash("sha256")
      .update(JSON.stringify(normalized)).digest("hex");
    const filePath = memory.getObservationsFile(context.repositoryId);
    const lockName = crypto.createHash("sha256")
      .update(params.idempotencyKey).digest("hex").slice(0, 32);
    const lockPath = getLockPath(filePath + ".bridge-" + lockName);

    return withLock(lockPath, () => {
      const existing = memory.readObservations(filePath).valid.find(row =>
        row.project === context.repositoryId &&
        row.source?.bridgeIdempotencyKey === params.idempotencyKey
      );
      if (existing) {
        if (existing.source.bridgeRequestHash !== requestHash) {
          throw invalid("idempotencyKey already used with different content or scope");
        }
        return Object.freeze({
          schemaVersion: 1, authority: "maestro", status: "REPLAYED",
          id: existing.id, scope: existing.scope
        });
      }

      const observation = memory.record(context.repositoryId, {
        ...normalized,
        verified: false,
        source: {
          tool: "maestro-bridge",
          bridgeIdempotencyKey: params.idempotencyKey,
          bridgeRequestHash: requestHash,
          operatorConfirmed: true
        }
      }, { projectRoot: root, gitContext: context });
      if (!observation) {
        throw invalid("Maestro capture policy rejected or disabled this observation");
      }
      return Object.freeze({
        schemaVersion: 1, authority: "maestro", status: "RECORDED",
        id: observation.id, scope: observation.scope
      });
    });
  }
  return Object.freeze({ record });
}

module.exports = { createGuardedMemoryWriter };
