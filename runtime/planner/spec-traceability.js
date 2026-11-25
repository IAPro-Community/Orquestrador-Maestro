"use strict";

/**
 * Short, traceable specification: criterion → verifier → source → task.
 *
 * Rules:
 * - A criterion with no verifier is reported as `unverified`. It is never
 *   silently dropped and never auto-attributed to a generic command.
 * - A verifier covers a criterion only by explicit `covers` text (normalized
 *   whitespace/case). Similarity guessing is not evidence.
 * - Sources come from read-only discovery and are echoed only when they are a
 *   safe relative path; discovery proves a symbol exists, not that it is
 *   compatible or reusable.
 * - Output is bounded and deterministic (stable ordering by task then criterion).
 */

const MAX_TASKS = 32;
const MAX_CRITERIA_PER_TASK = 8;
const MAX_CRITERION_CHARS = 240;
const MAX_ROWS = 96;
const MAX_SOURCE_CHARS = 240;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+ -]+(?:\/[A-Za-z0-9._@+ -]+)*$/u;

function normalize(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").toLowerCase() : "";
}

function boundedText(value, maxChars) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/\s+/gu, " ");
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
}

function safeRelativeSource(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/gu, "/");
  if (normalized.length === 0 || normalized.length > MAX_SOURCE_CHARS) return null;
  if (!SAFE_PATH.test(normalized)) return null;
  return normalized;
}

function normalizeVerifiers(verifiers) {
  if (verifiers === undefined) return [];
  if (!Array.isArray(verifiers)) throw new TypeError("verifiers must be an array");
  return verifiers.map((verifier) => {
    if (!verifier || typeof verifier !== "object" || Array.isArray(verifier)) {
      throw new TypeError("each verifier must be an object");
    }
    const taskId = typeof verifier.taskId === "string" ? verifier.taskId.trim() : "";
    const command = boundedText(verifier.command, 200);
    const id = boundedText(verifier.id, 80) || command;
    const covers = Array.isArray(verifier.covers) ? verifier.covers.map(normalize).filter(Boolean) : [];
    if (!taskId || !id || covers.length === 0) {
      throw new TypeError("verifier requires taskId, id/command and an explicit covers list");
    }
    return Object.freeze({ id, taskId, command: command || id, covers: Object.freeze(covers) });
  });
}

function normalizeSources(sources) {
  if (sources === undefined) return [];
  if (!Array.isArray(sources)) throw new TypeError("sources must be an array");
  const normalized = [];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const sourcePath = safeRelativeSource(source.path);
    if (!sourcePath) continue;
    normalized.push(Object.freeze({
      path: sourcePath,
      role: boundedText(source.role, 40) || "unknown",
      sourceDigest: typeof source.sourceDigest === "string" && /^[a-f0-9]{64}$/u.test(source.sourceDigest)
        ? source.sourceDigest : null
    }));
  }
  return normalized;
}

function buildSpecTraceability({ tasks, verifiers, sources } = {}) {
  if (!Array.isArray(tasks)) throw new TypeError("tasks must be an array");
  if (tasks.length > MAX_TASKS) throw new TypeError(`at most ${MAX_TASKS} tasks per spec`);
  const normalizedVerifiers = normalizeVerifiers(verifiers);
  const normalizedSources = normalizeSources(sources);

  const rows = [];
  const unverified = [];
  const truncated = [];
  const seenCriteria = new Map();

  for (const task of tasks) {
    if (!task || typeof task !== "object") throw new TypeError("each task must be an object");
    const taskId = typeof task.id === "string" ? task.id.trim() : "";
    if (!taskId) throw new TypeError("each task requires an id");
    const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [];
    if (criteria.length > MAX_CRITERIA_PER_TASK) truncated.push(taskId);
    for (const [index, rawCriterion] of criteria.slice(0, MAX_CRITERIA_PER_TASK).entries()) {
      const criterion = boundedText(rawCriterion, MAX_CRITERION_CHARS);
      if (!criterion) continue;
      const key = normalize(criterion);
      if (seenCriteria.has(key)) {
        // The same criterion claimed by two tasks is a spec smell: report it
        // instead of pretending both tasks are independently verified.
        seenCriteria.get(key).duplicateOf.push(taskId);
        continue;
      }
      const entry = {
        criterionId: `${taskId}#${index + 1}`,
        taskId,
        criterion,
        duplicateOf: [],
        verifier: null,
        source: null,
        status: "unverified"
      };
      seenCriteria.set(key, entry);
      const match = normalizedVerifiers.find((verifier) =>
        verifier.taskId === taskId && verifier.covers.includes(key));
      if (match) {
        entry.verifier = Object.freeze({ id: match.id, command: match.command });
        entry.status = "covered";
      } else {
        unverified.push(Object.freeze({ criterionId: entry.criterionId, taskId, criterion }));
      }
      const source = normalizedSources.find((candidate) => normalize(candidate.role) !== "unknown");
      if (source) entry.source = Object.freeze({ path: source.path, role: source.role, sourceDigest: source.sourceDigest });
      rows.push(Object.freeze(entry));
    }
  }

  const limited = rows.slice(0, MAX_ROWS);
  if (rows.length > MAX_ROWS) truncated.push("rows");
  const duplicates = [...seenCriteria.values()]
    .filter((entry) => entry.duplicateOf.length > 0)
    .map((entry) => Object.freeze({
      criterion: entry.criterion,
      tasks: Object.freeze([entry.taskId, ...entry.duplicateOf])
    }));

  return Object.freeze({
    schemaVersion: 1,
    rows: Object.freeze(limited),
    unverified: Object.freeze(unverified),
    duplicates: Object.freeze(duplicates),
    truncated: Object.freeze([...new Set(truncated)]),
    complete: unverified.length === 0 && duplicates.length === 0,
    totals: Object.freeze({
      tasks: tasks.length,
      criteria: rows.length,
      covered: rows.filter((row) => row.status === "covered").length,
      unverified: unverified.length,
      duplicates: duplicates.length
    })
  });
}

function renderSpecBrief(traceability, { maxChars = 4000 } = {}) {
  if (!traceability || !Array.isArray(traceability.rows)) {
    throw new TypeError("a built spec traceability is required");
  }
  const lines = ["## Spec (criterion → verifier → source → task)"];
  for (const row of traceability.rows) {
    const verifier = row.verifier ? `\`${row.verifier.command}\`` : "**no verifier**";
    const source = row.source ? ` · source: \`${row.source.path}\` (${row.source.role})` : "";
    lines.push(`- [${row.taskId}] ${row.criterion} → ${verifier}${source}`);
  }
  if (traceability.duplicates.length > 0) {
    lines.push(`- duplicate criteria: ${traceability.duplicates.map((item) => item.criterion).join("; ")}`);
  }
  if (traceability.truncated.length > 0) {
    lines.push(`- truncated: ${traceability.truncated.join(", ")}`);
  }
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

module.exports = { buildSpecTraceability, renderSpecBrief };