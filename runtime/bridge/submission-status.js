"use strict";

const fs = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");

function invalid(message) {
  const error = new TypeError(message);
  error.code = -32602;
  return error;
}
function sameRoot(a, b) {
  try {
    const first = fs.statSync(fs.realpathSync(a), { bigint: true });
    const second = fs.statSync(fs.realpathSync(b), { bigint: true });
    // Some Windows filesystems report ino=0. In that case comparing only
    // volume IDs could falsely authorize a different project directory.
    // Fail closed unless both identifiers are positive and match.
    return first.isDirectory() && second.isDirectory() &&
      first.ino > 0n && second.ino > 0n &&
      first.dev === second.dev && first.ino === second.ino;
  } catch {
    return false;
  }
}
function projectRootBinding(store, projectRoot) {
  return store.listProjects().then((projects) => {
    const candidates = projects.filter((project) =>
      project?.path && sameRoot(project.path, projectRoot));
    // Do not guess ownership if the same checkout was registered under
    // multiple project IDs. Caller projectId is never trusted here.
    if (candidates.length !== 1) throw invalid("no unique registered project for Bridge root");
    return candidates[0].id;
  });
}
function project(row) {
  if (!row) return null;
  // Intentionally omit approvalDigest, plan/artifact digests, clientKey,
  // workspaceFingerprint, leases, fence, workerId and raw metadata.
  return Object.freeze({
    schemaVersion: 1,
    authority: "MAESTRO",
    owner: "MAESTRO",
    submissionId: row.id,
    status: row.status,
    runId: row.runId || null,
    manifestId: row.manifestId || null,
    taskCount: row.taskCount,
    providers: Array.isArray(row.providers) ? [...row.providers] : [],
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    resultEvidence: "RUN_STORE_OBSERVED",
  });
}
// Measured per-run usage, read-only from the canonical RunStore. The single
// evidence source per field is the persisted run's metadata.cognitiveTelemetry
// (written once by the runtime when the run finalizes); the budget reservation
// commit (`budget.reservation.actual`) is DERIVED from that same telemetry, so
// it is never summed here — one source per field, no double counting.
// tokenSource gates evidence: "provider-reported" | "derived" carry provider
// measurements; "estimated"/"unavailable" do not. A field without measurement
// stays null (never 0); when no token field has real evidence the whole usage
// object is omitted so legacy clients keep the exact previous projection.
const MEASURED_TOKEN_SOURCES = new Set(["provider-reported", "derived"]);
function integerOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}
function usageProjection(run) {
  const telemetry = run?.metadata?.cognitiveTelemetry;
  if (!telemetry || typeof telemetry !== "object") return null;
  if (!MEASURED_TOKEN_SOURCES.has(telemetry.tokenSource)) return null;
  const tokensInput = integerOrNull(telemetry.tokenInput);
  const tokensOutput = integerOrNull(telemetry.tokenOutput);
  // tokensCached maps cachedInputTokens (cachedOutputTokens has no slot in the
  // frozen usage shape and is never summed with it).
  const tokensCached = integerOrNull(telemetry.cachedInputTokens);
  const tokensReasoning = integerOrNull(telemetry.reasoningTokens);
  if (tokensInput === null && tokensOutput === null &&
      tokensCached === null && tokensReasoning === null) return null;
  return Object.freeze({
    schemaVersion: 1,
    evidence: "RUN_STORE_OBSERVED",
    tokensInput,
    tokensOutput,
    tokensCached,
    tokensReasoning,
    durationMs: integerOrNull(telemetry.durationMs),
  });
}
// Fail-closed: without a trusted getRun adapter (or if the run lookup fails)
// the projection is returned unchanged, without usage — never guessed.
async function projectWithUsage(store, row) {
  const base = project(row);
  if (!row?.runId || typeof store?.getRun !== "function") return base;
  try {
    const usage = usageProjection(await store.getRun(row.runId));
    if (usage) return Object.freeze({ ...base, usage });
  } catch {
    // Omit usage; the redacted projection itself is still authoritative.
  }
  return base;
}
function createSubmissionStatusReader({ store, projectRoot }) {
  async function scoped() {
    if (!store?.listProjects || !store?.listRunSubmissions || !store?.getRunSubmission) {
      throw invalid("durable submission status is not installed");
    }
    return projectRootBinding(store, path.resolve(projectRoot));
  }
  return Object.freeze({
    async list(params = {}) {
      if (!params || typeof params !== "object" || Array.isArray(params) ||
          Object.keys(params).some((key) => key !== "limit")) {
        throw invalid("runs.submissions.list supports only a bounded limit");
      }
      const limit = params.limit === undefined ? 50 : params.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw invalid("limit must be an integer in [1, 100]");
      }
      const projectId = await scoped();
      const records = await store.listRunSubmissions({ projectId });
      const filtered = records.filter((row) => row.projectId === projectId);
      filtered.sort((a, b) =>
        String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
      return Object.freeze({
        schemaVersion: 1, authority: "MAESTRO", projectId,
        total: filtered.length, truncated: filtered.length > limit,
        submissions: await Promise.all(
          filtered.slice(0, limit).map((row) => projectWithUsage(store, row))),
      });
    },
    // Snapshot polling, NOT replayable events or a push subscription. The
    // cursor hashes only redacted project projections plus the requested page.
    // Restarting the Bridge does not reset it because RunStore is canonical.
    async poll(params = {}) {
      if (!params || typeof params !== "object" || Array.isArray(params) ||
          Object.keys(params).some((key) => !["cursor", "limit", "offset"].includes(key))) {
        throw invalid("runs.submissions.poll allows only cursor, limit and offset");
      }
      const limit = params.limit === undefined ? 50 : params.limit;
      const offset = params.offset === undefined ? 0 : params.offset;
      const previous = params.cursor;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
          !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 ||
          (previous !== undefined &&
            (typeof previous !== "string" || !/^s1:[a-f0-9]{64}$/.test(previous)))) {
        throw invalid("invalid bounded submission polling cursor, limit or offset");
      }
      const projectId = await scoped();
      const rows = await store.listRunSubmissions({ projectId });
      // Do not trust backend filtering. Deterministic ordering prevents cursor
      // jitter across processes, and mapping strips secrets before hashing.
      const visible = (await Promise.all(
        rows.filter((row) => row?.projectId === projectId)
          .map((row) => projectWithUsage(store, row))))
        .sort((a, b) => a.submissionId.localeCompare(b.submissionId));
      const cursor = "s1:" + createHash("sha256").update(
        JSON.stringify(["MAESTRO_SUBMISSIONS_SNAPSHOT_V1", projectId, limit, offset, visible])
      ).digest("hex");
      const changed = cursor !== previous;
      const page = changed ? visible.slice(offset, offset + limit) : [];
      return Object.freeze({
        schemaVersion: 1, authority: "MAESTRO", owner: "MAESTRO",
        delivery: "SNAPSHOT_POLL", replayable: false,
        projectId, cursor, changed, total: visible.length,
        offset, limit, nextOffset: offset + limit < visible.length ? offset + limit : null,
        submissions: page
      });
    },
    async cancel(params = {}) {
      if (!params || typeof params !== "object" || Array.isArray(params) ||
          Object.keys(params).some((key) => key !== "submissionId") ||
          typeof params.submissionId !== "string" ||
          !/^[A-Za-z0-9._:-]{8,128}$/.test(params.submissionId)) {
        throw invalid("runs.submissions.cancel requires a safe submissionId");
      }
      if (typeof store?.requestRunSubmissionCancellation !== "function") {
        throw invalid("durable submission cancellation is not installed");
      }
      const projectId = await scoped();
      const current = await store.getRunSubmission(params.submissionId);
      // Match the read surface: never reveal whether a foreign ID exists.
      if (!current || current.projectId !== projectId) return null;
      const updated = await store.requestRunSubmissionCancellation(current.id);
      // The RunStore owns the atomic PENDING_WORKER -> CANCELLED transition,
      // or records CANCEL_REQUESTED for a worker already in flight.
      if (!updated || updated.projectId !== projectId) {
        throw invalid("submission ownership changed during cancellation");
      }
      return projectWithUsage(store, updated);
    },
    async get(params = {}) {
      if (!params || typeof params !== "object" || Array.isArray(params) ||
          Object.keys(params).some((key) => key !== "submissionId") ||
          typeof params.submissionId !== "string" ||
          !/^[A-Za-z0-9._:-]{1,128}$/.test(params.submissionId)) {
        throw invalid("runs.submissions.get requires a safe submissionId");
      }
      const projectId = await scoped();
      const row = await store.getRunSubmission(params.submissionId);
      if (!row || row.projectId !== projectId) return null;
      return projectWithUsage(store, row);
    },
  });
}
module.exports = { createSubmissionStatusReader };
