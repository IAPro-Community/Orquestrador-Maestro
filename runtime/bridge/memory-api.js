"use strict";

const path = require("node:path");
const { Memory, isTrulyVerified } = require("../../orquestrador/bin/memory");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");

const MEMORY_READ_VERSION = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 10000;
const MAX_SEARCH_CHARS = 200;
const MAX_DETAILS_CHARS = 4000;
const SAFE_TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_OBSERVATION_ID = /^obs_[a-f0-9]{16}$/;
const TYPES = new Set(require("../../orquestrador/schemas/MEMORY_SCHEMA.json").properties.type.enum);

// The Bridge must never accept a caller-supplied repository id, branch,
// workspace id or arbitrary memory storage path. The same canonical Maestro
// visibility rules used by context retrieval apply to every read.
function createScopedMemoryAPI(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const memory = options.memory || new Memory();

  function validate(params = {}) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw invalidParams("params must be an object");
    }
    if (params.projectPath !== undefined &&
        (typeof params.projectPath !== "string" || path.resolve(params.projectPath) !== projectRoot)) {
      throw invalidParams("projectPath must match the Bridge project root");
    }
    for (const forbidden of ["repositoryId", "branch", "workspaceId", "headCommit", "scope", "allowAncestry", "baseDir"]) {
      if (params[forbidden] !== undefined) {
        throw invalidParams(`${forbidden} is derived by Maestro and cannot be overridden`);
      }
    }
    if (params.taskId !== undefined && (typeof params.taskId !== "string" || !SAFE_TASK_ID.test(params.taskId))) {
      throw invalidParams("taskId must be a safe project-scoped identifier");
    }
    if (params.search !== undefined &&
        (typeof params.search !== "string" || params.search.length > MAX_SEARCH_CHARS)) {
      throw invalidParams("search must be a string of at most 200 characters");
    }
    if (params.type !== undefined && !TYPES.has(params.type)) {
      throw invalidParams("type must be a known memory observation type");
    }
    if (params.verified !== undefined && typeof params.verified !== "boolean") {
      throw invalidParams("verified must be boolean");
    }
    if (params.rank !== undefined && typeof params.rank !== "boolean") {
      throw invalidParams("rank must be boolean");
    }
    if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > MAX_LIMIT)) {
      throw invalidParams("limit must be an integer between 1 and 50");
    }
    if (params.offset !== undefined && (!Number.isInteger(params.offset) || params.offset < 0 || params.offset > MAX_OFFSET)) {
      throw invalidParams("offset must be an integer between 0 and 10000");
    }
    return params;
  }

  function visible(params) {
    const context = resolveGitContext(projectRoot);
    // Do not call Memory.search(), Memory.timeline(), or Memory.show():
    // those methods do not enforce worktree/branch/task visibility.
    const rows = memory.searchWithVisibility(context.repositoryId, context, {
      taskId: params.taskId,
      search: params.search,
      type: params.type,
      verified: params.verified,
      rank: params.rank === true && Boolean(params.search),
      allowAncestry: false
    });
    const filtered = rows.filter((row) => {
      if (!row || typeof row !== "object" || row.project !== context.repositoryId) return false;
      // Historical raw rows might predate persistence redaction. Never expose
      // explicitly private-tagged content through a new Bridge endpoint.
      return !memory.containsPrivateDeep({
        summary: row.summary,
        details: row.details,
        files: row.files,
        tags: row.tags,
        source: row.source
      });
    });
    return { context, rows: filtered };
  }

  function projectObservation(row, includeDetails = false) {
    const result = {
      id: row.id,
      timestamp: row.timestamp,
      type: row.type,
      summary: row.summary,
      verified: isTrulyVerified(row),
      scope: {
        level: row.scope.level,
        repositoryId: row.scope.repositoryId,
        ...(row.scope.branch ? { branch: row.scope.branch } : {}),
        ...(row.scope.workspaceId ? { workspaceId: row.scope.workspaceId } : {}),
        ...(row.scope.taskId ? { taskId: row.scope.taskId } : {}),
        ...(row.scope.headCommit ? { headCommit: row.scope.headCommit } : {})
      }
    };
    if (includeDetails) {
      result.details = typeof row.details === "string" ? row.details.slice(0, MAX_DETAILS_CHARS) : null;
      result.tags = Array.isArray(row.tags) ? row.tags.slice(0, 32) : [];
      result.files = Array.isArray(row.files) ? row.files.slice(0, 32) : [];
      result.source = row.source && typeof row.source === "object" && !Array.isArray(row.source)
        ? row.source : {};
      result.taskId = row.taskId || null;
      result.verifier = isTrulyVerified(row) ? row.verifier : null;
      result.verifiedAt = isTrulyVerified(row) ? row.verifiedAt : null;
    }
    return memory.redactValue(result);
  }

  function search(rawParams = {}) {
    const params = validate(rawParams);
    const { rows } = visible(params);
    const offset = params.offset ?? 0;
    const limit = params.limit ?? DEFAULT_LIMIT;
    const selected = rows.slice(offset, offset + limit);
    return {
      schemaVersion: MEMORY_READ_VERSION,
      authority: "maestro",
      items: selected.map(row => projectObservation(row, false)),
      page: { offset, limit, hasMore: rows.length > offset + limit }
    };
  }

  function get(rawParams = {}) {
    const params = validate(rawParams);
    if (!SAFE_OBSERVATION_ID.test(params.id || "")) {
      throw invalidParams("id must be a canonical observation id");
    }
    const { rows } = visible(params);
    const observation = rows.find(row => row.id === params.id);
    return observation ? { schemaVersion: MEMORY_READ_VERSION, authority: "maestro",
      observation: projectObservation(observation, true) } : null;
  }

  function timeline(rawParams = {}) {
    const params = validate(rawParams);
    const { rows } = visible(params);
    const offset = params.offset ?? 0;
    const limit = params.limit ?? DEFAULT_LIMIT;
    return {
      schemaVersion: MEMORY_READ_VERSION,
      authority: "maestro",
      items: rows.slice(offset, offset + limit).map(row => ({
        id: row.id, timestamp: row.timestamp, type: row.type,
        summary: memory.redactContent(row.summary),
        verified: isTrulyVerified(row),
        scopeLevel: row.scope.level
      })),
      page: { offset, limit, hasMore: rows.length > offset + limit }
    };
  }

  return Object.freeze({ search, get, timeline });
}

function invalidParams(message) {
  const error = new Error(message);
  error.code = -32602;
  return error;
}

module.exports = { createScopedMemoryAPI, MEMORY_READ_VERSION };
