"use strict";

const fs = require("node:fs");
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
    return first.isDirectory() && second.isDirectory() &&
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
        submissions: filtered.slice(0, limit).map(project),
      });
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
      return project(row);
    },
  });
}
module.exports = { createSubmissionStatusReader };
