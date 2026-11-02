"use strict";

const fs = require("node:fs");
const path = require("node:path");

const EVENT_TYPES = new Set([
  "run.created", "run.started", "run.completed", "run.failed",
  "run.blocked", "run.cancelled", "run.canceled",
  "verification.started", "verification.completed", "verification.failed",
  "review.started", "review.completed", "review.failed",
  "execution.started", "execution.completed", "execution.failed",
  "artifact.created"
]);
const SAFE_ID = /^[a-zA-Z0-9._:-]{1,128}$/;
const MAX_EVENTS = 100;

function invalid(message) {
  const error = new TypeError(message);
  error.code = -32602;
  return error;
}
function sameProject(a, b) {
  try { return fs.realpathSync(a) === fs.realpathSync(b); }
  catch { return false; }
}
function createRunObserver({ projectRoot, runtime }) {
  const root = path.resolve(projectRoot || process.cwd());
  async function observe(params = {}) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
      throw invalid("run observation requires an object");
    }
    const allowed = new Set(["runId", "afterEventId", "limit"]);
    for (const key of Object.keys(params)) {
      if (!allowed.has(key)) throw invalid("unsupported runs.observe parameter: " + key);
    }
    if (typeof params.runId !== "string" || !SAFE_ID.test(params.runId)) {
      throw invalid("runId must be a bounded safe identifier");
    }
    if (params.afterEventId !== undefined &&
      (typeof params.afterEventId !== "string" || !SAFE_ID.test(params.afterEventId))) {
      throw invalid("afterEventId must be a bounded safe identifier");
    }
    const limit = params.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EVENTS) {
      throw invalid("limit must be an integer between 1 and 100");
    }
    if (!runtime || typeof runtime.inspectRun !== "function") {
      const error = new Error("Maestro runtime run observation unavailable");
      error.code = -32601;
      throw error;
    }
    const inspection = await runtime.inspectRun(params.runId);
    // Do not distinguish missing and foreign-project runs. A local Bridge
    // process has a single canonical root, not permission to enumerate every
    // RunStore project or worktree.
    if (!inspection?.run || !inspection?.task || !inspection?.project ||
      typeof inspection.project.path !== "string" ||
      !sameProject(root, inspection.project.path) ||
      inspection.run.taskId !== inspection.task.id ||
      inspection.task.projectId !== inspection.project.id) {
      return null;
    }
    const rows = Array.isArray(inspection.events) ? inspection.events : [];
    // Raw process output, diagnostic payloads and tool traces are intentionally
    // absent. Only recognized lifecycle event IDs/types/timestamps can replay.
    const items = rows.filter(item => item && EVENT_TYPES.has(item.type) &&
      typeof item.id === "string" && SAFE_ID.test(item.id) &&
      (item.runId === params.runId || item.data?.runId === params.runId));
    const offset = params.afterEventId === undefined
      ? 0 : items.findIndex(item => item.id === params.afterEventId) + 1;
    if (params.afterEventId !== undefined && offset === 0) {
      throw invalid("afterEventId is not a durable event cursor for this run");
    }
    const page = items.slice(offset, offset + limit).map(item => Object.freeze({
      id: item.id,
      type: item.type,
      occurredAt: typeof item.occurredAt === "string" ? item.occurredAt : null
    }));
    return Object.freeze({
      schemaVersion: 1,
      authority: "MAESTRO",
      executionOwner: "MAESTRO",
      runId: inspection.run.id,
      taskId: inspection.task.id,
      providerId: typeof inspection.run.providerId === "string" ? inspection.run.providerId : null,
      status: typeof inspection.run.status === "string" ? inspection.run.status : "unknown",
      replayKind: "sanitized-lifecycle-only",
      liveOutputAvailable: false,
      events: page,
      nextCursor: page.length ? page[page.length - 1].id : params.afterEventId ?? null,
      hasMore: items.length > offset + page.length
    });
  }
  return Object.freeze({ observe });
}
module.exports = { createRunObserver };
