"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeAdmission, validateID, validateWorker, isWorkspaceOccupied, validateAdmissionLedger, bad } = require("../runs/submission-admission");
const { RunStore } = require("./run-store");
const { normalizeExecutableManifest, validateStoredExecutableManifest } = require("../runs/executable-manifest");

const COLLECTIONS = Object.freeze(["projects", "missions", "tasks", "runs", "steps", "executions", "events", "artifacts", "evidence", "verifications", "terminals", "projectSnapshots", "intentSessions", "missionBriefs", "taskGraphs", "attention", "runSubmissions", "executableManifests"]);

function emptyState() {
  return { version: 1, projects: [], missions: [], tasks: [], runs: [], steps: [], executions: [], events: [], artifacts: [], evidence: [], verifications: [], terminals: [], projectSnapshots: [], intentSessions: [], missionBriefs: [], taskGraphs: [], attention: [], runSubmissions: [], executableManifests: [] };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function assertRecord(record, label) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError(`${label} must be an object`);
  if (typeof record.id !== "string" || record.id.trim() === "") throw new TypeError(`${label}.id must be a non-empty string`);
}

function assertKnownCollection(collection) {
  if (!COLLECTIONS.includes(collection)) throw new TypeError(`unknown RunStore collection: ${collection}`);
}

/**
 * Portable operational persistence for the initial runtime. This intentionally
 * uses no native SQLite dependency: it is Node 20-compatible on Windows,
 * Linux, and macOS. Each mutation atomically replaces one private JSON file.
 */
class JsonFileRunStore extends RunStore {
  constructor({ filePath, lockTimeoutMs = 60_000, lockStaleMs = 30_000, lockRetryMs = 25 } = {}) {
    super();
    if (typeof filePath !== "string" || filePath.trim() === "") throw new TypeError("filePath must be a non-empty string");
    for (const [name, value] of Object.entries({ lockTimeoutMs, lockStaleMs, lockRetryMs })) {
      if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
    }
    this.filePath = path.resolve(filePath);
    this.lockPath = `${this.filePath}.lock`;
    this.lockTimeoutMs = lockTimeoutMs;
    this.lockStaleMs = lockStaleMs;
    this.lockRetryMs = lockRetryMs;
    this._state = null;
    this._mutation = Promise.resolve();
    this._lastWriteMtime = null;
    this._initializing = null;
  }

  async initialize() {
    if (this._state) return;
    if (this._initializing) return this._initializing;
    this._initializing = (async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      const release = await this._acquireFileLock();
      try {
        if (this._state) return;
        await this._reloadFromDisk({ createIfMissing: true });
      } finally {
        await release();
      }
    })();
    try {
      await this._initializing;
    } finally {
      this._initializing = null;
    }
  }

  async _readFresh() {
    await this.initialize();
    await this._mutation;
    await this._reloadIfChanged();
  }

  async createProject(project) { return this._save("projects", project); }
  async saveMission(mission) { return this._save("missions", mission); }
  async saveTask(task) { return this._save("tasks", task); }
  async saveRun(run) { return this._save("runs", run); }
  async saveStep(step) { return this._save("steps", step); }
  async saveExecution(execution) { return this._save("executions", execution); }
  async saveArtifact(artifact) { return this._save("artifacts", artifact); }
  async saveEvidence(evidence) { return this._save("evidence", evidence); }
  async saveVerification(verification) { return this._save("verifications", verification); }
  async saveTerminal(terminal) { return this._save("terminals", terminal); }

  async saveProjectSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new TypeError(`snapshot must be an object`);
    if (typeof snapshot.projectId !== "string" || snapshot.projectId.trim() === "") throw new TypeError(`snapshot.projectId must be a non-empty string`);

    assertKnownCollection("projectSnapshots");
    return this._mutate(async () => {
      const persisted = clone(snapshot);
      this._state["projectSnapshots"].push(persisted);
      await this._flush();
      return clone(persisted);
    });
  }

  async saveIntentSession(session) { return this._save("intentSessions", session); }
  async saveMissionBrief(brief) { return this._save("missionBriefs", brief); }
  async saveTaskGraph(graph) { return this._save("taskGraphs", graph); }
  async saveAttention(request) { return this._save("attention", request); }

  // Admission is an operational queue ledger, not an executable Run. A
  // provider cannot start without a separate fenced worker implementation.
  // Immutable, metadata-only DAG manifests. Storing a manifest does NOT
  // approve it, create a Run, or authorize provider side effects.
  async putExecutableManifest(input) {
    const manifest = normalizeExecutableManifest(input);
    return this._mutate(async () => {
      const previous = this._state.executableManifests.find((item) =>
        item.projectId === manifest.projectId &&
        item.planDigest === manifest.planDigest &&
        item.artifactDigest === manifest.artifactDigest);
      if (previous) {
        if (previous.id !== manifest.id || previous.digest !== manifest.digest) {
          throw bad("immutable plan/artifact manifest cannot be rebound", "EXECUTABLE_MANIFEST_CONFLICT");
        }
        return clone(previous);
      }
      const project = this._state.projects.find((item) => item.id === manifest.projectId);
      if (!project) throw bad("executable manifest project is unregistered", "MANIFEST_PROJECT_NOT_FOUND");
      this._state.executableManifests.push(clone(manifest));
      await this._flush();
      return clone(manifest);
    });
  }
  async getExecutableManifest(id) { return this._get("executableManifests", id); }
  async listExecutableManifests(filters = {}) {
    return this._list("executableManifests", filters, ["projectId"]);
  }

  async admitRunSubmission(input) {
    const spec = normalizeAdmission(input);
    return this._mutate(async () => {
      const existing = this._state.runSubmissions.find((row) =>
        row.projectId === spec.projectId && row.clientKey === spec.clientKey);
      if (existing) {
        if (existing.requestDigest !== spec.requestDigest) {
          throw bad("idempotency key reused for a different approved request", "RUN_SUBMISSION_CONFLICT");
        }
        return { submission: clone(existing), replayed: true };
      }
      const busy = this._state.runSubmissions.find((row) =>
        row.workspaceFingerprint === spec.workspaceFingerprint &&
        isWorkspaceOccupied(row.status));
      if (busy) throw bad("workspace is already reserved by a pending or unresolved submission", "WORKSPACE_RESERVED");
      const now = new Date().toISOString();
      const submission = {
        id: "submission-" + crypto.randomUUID(),
        ...spec,
        status: "PENDING_WORKER",
        fence: 0,
        workerId: null,
        leaseExpiresAt: null,
        runId: null,
        preparedRunId: null,
        createdAt: now,
        updatedAt: now
      };
      this._state.runSubmissions.push(submission);
      await this._flush();
      return { submission: clone(submission), replayed: false };
    });
  }

  async getRunSubmission(submissionId) { return this._get("runSubmissions", submissionId); }
  async listRunSubmissions(filters = {}) {
    return this._list("runSubmissions", filters, ["projectId", "status"]);
  }

  async claimRunSubmission(submissionId, { workerId, leaseMs = 30000 } = {}) {
    validateID(submissionId, "submissionId");
    validateWorker(workerId, undefined, leaseMs);
    return this._mutate(async () => {
      const row = this._state.runSubmissions.find((record) => record.id === submissionId);
      if (!row) return null;
      if (row.status !== "PENDING_WORKER") {
        throw bad("submission cannot be claimed from status " + row.status, "SUBMISSION_NOT_CLAIMABLE");
      }
      row.fence += 1;
      row.status = "CLAIMED";
      row.workerId = workerId;
      row.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
      row.updatedAt = new Date().toISOString();
      await this._flush();
      return clone(row);
    });
  }

  async renewRunSubmissionLease(submissionId, { workerId, fence, leaseMs = 30000 } = {}) {
    validateID(submissionId, "submissionId");
    validateWorker(workerId, fence, leaseMs);
    return this._mutate(async () => {
      const row = this._state.runSubmissions.find((record) => record.id === submissionId);
      this._requireCurrentWorker(row, workerId, fence);
      if (!["CLAIMED", "DISPATCHED", "CANCEL_REQUESTED"].includes(row.status)) {
        throw bad("submission cannot renew lease in status " + row.status, "SUBMISSION_NOT_RUNNING");
      }
      row.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
      row.updatedAt = new Date().toISOString();
      await this._flush();
      return clone(row);
    });
  }

  _requireCurrentWorker(row, workerId, fence) {
    if (!row || row.workerId !== workerId || row.fence !== fence ||
        !row.leaseExpiresAt || Date.parse(row.leaseExpiresAt) <= Date.now()) {
      throw bad("stale or expired worker fence", "STALE_SUBMISSION_FENCE");
    }
  }

  // Bind a prepared (but never executed) Run to the fenced submission.
  // This evidence is persisted before cancellation or provider dispatch, so
  // a caller cannot cancel an unrelated pending Run in the same project.
  async bindPreparedRunSubmission(submissionId, { workerId, fence, runId } = {}) {
    validateID(submissionId, "submissionId");
    validateWorker(workerId, fence);
    validateID(runId, "runId");
    return this._mutate(async () => {
      const row = this._state.runSubmissions.find((record) => record.id === submissionId);
      this._requireCurrentWorker(row, workerId, fence);
      if (!["CLAIMED", "CANCEL_REQUESTED"].includes(row.status) || row.runId !== null ||
          (row.preparedRunId != null && row.preparedRunId !== runId)) {
        throw bad("prepared Run cannot be rebound or attached after dispatch", "RUN_PROVENANCE_MISMATCH");
      }
      const preparedRun = this._state.runs.find((run) => run.id === runId);
      const task = this._state.tasks.find((item) => item.id === preparedRun?.taskId);
      const steps = this._state.steps.filter((step) => step.runId === runId);
      if (!preparedRun || !task || task.projectId !== row.projectId ||
          !row.providers.includes(preparedRun.providerId) || preparedRun.status !== "pending" ||
          steps.length === 0 || steps.some((step) => step.status !== "pending") ||
          this._state.executions.some((execution) => execution.runId === runId) ||
          this._state.runSubmissions.some((other) =>
            other.id !== row.id && (other.runId === runId || other.preparedRunId === runId))) {
        throw bad("only an unexecuted Run of this submission may be bound", "RUN_PROVENANCE_MISMATCH");
      }
      row.preparedRunId = runId;
      row.updatedAt = new Date().toISOString();
      await this._flush();
      return clone(row);
    });
  }

  // DISPATCHED is only written after a real Maestro Run ID is known. This
  // ledger does not create runs or call a provider by itself.
  async markRunSubmissionDispatched(submissionId, { workerId, fence, runId } = {}) {
    validateID(submissionId, "submissionId");
    validateID(workerId, "workerId");
    validateWorker(workerId, fence);
    validateID(runId, "runId");
    return this._mutate(async () => {
      const row = this._state.runSubmissions.find((record) => record.id === submissionId);
      this._requireCurrentWorker(row, workerId, fence);
      if (row.status !== "CLAIMED") throw bad("submission was already dispatched or cancelled", "SUBMISSION_NOT_CLAIMABLE");
      if (row.preparedRunId != null && row.preparedRunId !== runId) {
        throw bad("dispatch Run differs from the bound prepared Run", "RUN_PROVENANCE_MISMATCH");
      }
      const persistedRun = this._state.runs.find((run) => run.id === runId);
      const persistedTask = this._state.tasks.find((task) => task.id === persistedRun?.taskId);
      if (!persistedRun || !persistedTask ||
          persistedTask.projectId !== row.projectId ||
          !row.providers.includes(persistedRun.providerId) ||
          persistedRun.status !== "pending") {
        throw bad("dispatch requires a persisted matching pending Maestro Run", "RUN_PROVENANCE_MISMATCH");
      }
      row.runId = runId;
      row.status = "DISPATCHED";
      row.updatedAt = new Date().toISOString();
      await this._flush();
      return clone(row);
    });
  }

  async finishRunSubmission(submissionId, { workerId, fence, status, preparedRunId } = {}) {
    validateID(submissionId, "submissionId");
    validateWorker(workerId, fence);
    if (preparedRunId !== undefined) validateID(preparedRunId, "preparedRunId");
    if (!["COMPLETED", "FAILED", "BLOCKED", "TIMED_OUT", "CANCELLED"].includes(status)) throw bad("unsupported submission terminal status");
    return this._mutate(async () => {
      const row = this._state.runSubmissions.find((record) => record.id === submissionId);
      this._requireCurrentWorker(row, workerId, fence);
      if (row.status !== "DISPATCHED" && row.status !== "CANCEL_REQUESTED") {
        throw bad("terminal status is not valid for the submission state", "SUBMISSION_INVALID_TRANSITION");
      }
      if (status === "CANCELLED" && row.status !== "CANCEL_REQUESTED") {
        throw bad("cancellation must be requested before it is confirmed", "SUBMISSION_INVALID_TRANSITION");
      }
      const persistedRun = this._state.runs.find((run) => run.id === row.runId);
      const runStatus = { COMPLETED: "completed", FAILED: "failed", BLOCKED: "blocked", TIMED_OUT: "timed_out", CANCELLED: "cancelled" }[status];
      // The worker may acknowledge cancellation before it has created a Run.
      // It is safe only while no dispatch was ever recorded. A late cancel
      // after a completed Run must be recorded as COMPLETED, not fabricated as
      // provider cancellation.
      const cancelledBeforeDispatch = status === "CANCELLED" &&
        row.status === "CANCEL_REQUESTED" && row.runId === null;
      if (!cancelledBeforeDispatch && (!persistedRun || persistedRun.status !== runStatus)) {
        throw bad("terminal submission status requires a matching persisted Maestro Run", "RUN_PROVENANCE_MISMATCH");
      }
      // When preparation persisted a Run but provider dispatch never began,
      // atomically cancel that Run and its pending Steps with the submission.
      // Otherwise a detached pending Run could be mistaken for resumable work.
      if (preparedRunId !== undefined) {
        if (row.preparedRunId !== preparedRunId) {
          throw bad("prepared Run is not bound to this submission", "RUN_PROVENANCE_MISMATCH");
        }
        if (!cancelledBeforeDispatch) {
          throw bad("preparedRunId is valid only for cancellation before dispatch", "SUBMISSION_INVALID_TRANSITION");
        }
        const preparedRun = this._state.runs.find((run) => run.id === preparedRunId);
        const task = this._state.tasks.find((item) => item.id === preparedRun?.taskId);
        const steps = this._state.steps.filter((step) => step.runId === preparedRunId);
        if (!preparedRun || !task || task.projectId !== row.projectId ||
            !row.providers.includes(preparedRun.providerId) ||
            preparedRun.status !== "pending" || steps.length === 0 ||
            steps.some((step) => step.status !== "pending") ||
            this._state.executions.some((execution) => execution.runId === preparedRunId) ||
            this._state.runSubmissions.some((other) => other.id !== row.id && other.runId === preparedRunId)) {
          throw bad("prepared Run cannot be cancelled without matching pre-dispatch evidence", "RUN_PROVENANCE_MISMATCH");
        }
        const at = new Date().toISOString();
        preparedRun.status = "cancelled";
        preparedRun.completedAt = at;
        for (const step of steps) {
          step.status = "cancelled";
          step.completedAt = at;
        }
      }
      row.status = status;
      row.workerId = null;
      row.leaseExpiresAt = null;
      row.updatedAt = new Date().toISOString();
      await this._flush();
      return clone(row);
    });
  }

  async requestRunSubmissionCancellation(submissionId) {
    validateID(submissionId, "submissionId");
    return this._mutate(async () => {
      const row = this._state.runSubmissions.find((record) => record.id === submissionId);
      if (!row) return null;
      if (row.status === "PENDING_WORKER") {
        row.status = "CANCELLED";
      } else if (row.status === "CLAIMED" || row.status === "DISPATCHED") {
        row.status = "CANCEL_REQUESTED"; // only worker can confirm actual cancellation
      } else {
        return clone(row); // completed, already cancelling, or reconciliation required
      }
      row.updatedAt = new Date().toISOString();
      await this._flush();
      return clone(row);
    });
  }

  // On crash/restart, expired claims become operator-visible blockers rather
  // than being automatically redispatched (external side effects unknown).
  async quarantineExpiredRunSubmission(submissionId) {
    validateID(submissionId, "submissionId");
    return this._mutate(async () => {
      const row = this._state.runSubmissions.find((record) => record.id === submissionId);
      if (!row) return null;
      if (!["CLAIMED", "DISPATCHED", "CANCEL_REQUESTED"].includes(row.status)) return clone(row);
      if (!row.leaseExpiresAt || Date.parse(row.leaseExpiresAt) > Date.now()) {
        throw bad("cannot quarantine an active worker lease", "SUBMISSION_LEASE_ACTIVE");
      }
      row.status = "RECONCILIATION_REQUIRED";
      row.workerId = null;
      row.leaseExpiresAt = null;
      row.updatedAt = new Date().toISOString();
      await this._flush();
      return clone(row);
    });
  }

  async appendEvent(event) {
    assertRecord(event, "event");
    return this._mutate(async () => {
      if (this._state.events.some((entry) => entry.id === event.id)) throw new Error(`event already exists: ${event.id}`);
      const persisted = clone({ ...event, occurredAt: event.occurredAt || new Date().toISOString() });
      this._state.events.push(persisted);
      await this._flush();
      return clone(persisted);
    });
  }

  async getProject(id) { return this._get("projects", id); }
  async getMission(id) { return this._get("missions", id); }
  async getTask(id) { return this._get("tasks", id); }
  async getRun(id) { return this._get("runs", id); }
  async getStep(id) { return this._get("steps", id); }
  async getExecution(id) { return this._get("executions", id); }
  async getArtifact(id) { return this._get("artifacts", id); }
  async getEvidence(id) { return this._get("evidence", id); }
  async getVerification(id) { return this._get("verifications", id); }
  async getTerminal(id) { return this._get("terminals", id); }

  async getLatestProjectSnapshot(projectId) {
    await this._readFresh();
    if (typeof projectId !== "string" || projectId.trim() === "") throw new TypeError("projectId must be a non-empty string");
    const snapshots = this._state.projectSnapshots.filter(s => s.projectId === projectId);
    if (snapshots.length === 0) throw new Error(`Project snapshot not found for project: ${projectId}`);
    return clone(snapshots[snapshots.length - 1]);
  }

  async getIntentSession(id) { return this._get("intentSessions", id); }
  async getMissionBrief(id) { return this._get("missionBriefs", id); }
  async getTaskGraph(id) { return this._get("taskGraphs", id); }
  async getAttention(id) { return this._get("attention", id); }

  async listProjects() { return this._list("projects"); }
  async listMissions(filters) { return this._list("missions", filters, ["projectId", "status", "mode"]); }
  async listTasks(filters) { return this._list("tasks", filters); }
  async listRuns(filters = {}) {
    await this._readFresh();
    let runs = this._state.runs;
    if (filters.projectId) {
      const taskIds = new Set(this._state.tasks.filter((task) => task.projectId === filters.projectId).map((task) => task.id));
      runs = runs.filter((run) => taskIds.has(run.taskId));
    }
    return this._filter(runs, filters, ["taskId", "status", "providerId"]);
  }
  async listSteps(filters) { return this._list("steps", filters); }
  async listExecutions(filters) { return this._list("executions", filters); }
  async listEvents(filters) { return this._list("events", filters); }
  async listArtifacts(filters) { return this._list("artifacts", filters); }
  async listEvidence(filters) { return this._list("evidence", filters, ["taskId", "runId", "artifactId", "verificationId", "type"]); }
  async listVerifications(filters) { return this._list("verifications", filters); }
  async listTerminals(filters) { return this._list("terminals", filters, ["projectId", "kind", "backend", "status", "providerId"]); }
  async listTaskGraphs(filters) { return this._list("taskGraphs", filters, ["missionId", "status"]); }
  async listAttention(filters) { return this._list("attention", filters, ["projectId", "status", "type"]); }

  async _save(collection, record) {
    assertKnownCollection(collection);
    assertRecord(record, collection.slice(0, -1));
    return this._mutate(async () => {
      const persisted = clone(record);
      const index = this._state[collection].findIndex((entry) => entry.id === persisted.id);
      if (index === -1) this._state[collection].push(persisted);
      else this._state[collection][index] = persisted;
      await this._flush();
      return clone(persisted);
    });
  }

  async _get(collection, id) {
    await this._readFresh();
    if (typeof id !== "string" || id.trim() === "") throw new TypeError("id must be a non-empty string");
    const record = this._state[collection].find((entry) => entry.id === id);
    return record ? clone(record) : undefined;
  }

  async _list(collection, filters = {}, allowed) {
    assertKnownCollection(collection);
    await this._readFresh();
    return this._filter(this._state[collection], filters, allowed);
  }

  _filter(records, filters, allowed = ["projectId", "runId", "stepId", "taskId", "status", "providerId", "type"]) {
    if (!filters || typeof filters !== "object" || Array.isArray(filters)) throw new TypeError("filters must be an object");
    let result = records;
    for (const key of allowed) {
      if (filters[key] !== undefined) result = result.filter((record) => record[key] === filters[key]);
    }
    if (filters.limit !== undefined) {
      if (!Number.isInteger(filters.limit) || filters.limit < 0) throw new TypeError("filters.limit must be a non-negative integer");
      result = result.slice(0, filters.limit);
    }
    return clone(result);
  }

  async _mutate(operation) {
    const next = this._mutation.then(async () => {
      await this.initialize();
      const release = await this._acquireFileLock();
      try {
        // The lock serializes independent Maestro processes. Always reload
        // inside the critical section so the mutation is based on the latest
        // committed file, never on a stale in-memory snapshot. Reloading is
        // fail-closed: a store removed after initialisation is a hard error,
        // never permission to recreate an empty snapshot.
        await this._reloadIfChanged();
        return await operation();
      } finally {
        await release();
      }
    });
    this._mutation = next.catch(() => undefined);
    return next;
  }

  async _reloadFromDisk({ createIfMissing = false } = {}) {
    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      this._state = this._validateState(JSON.parse(contents));
      this._lastWriteMtime = (await fs.stat(this.filePath)).mtimeMs;
    } catch (error) {
      if (error && error.code === "ENOENT" && createIfMissing) {
        this._state = emptyState();
        await this._flush();
        return;
      }
      if (error instanceof SyntaxError) throw new Error(`RunStore data is invalid JSON: ${this.filePath}`);
      throw error;
    }
  }

  async _reloadIfChanged() {
    // Read on every operation: mtimeMs can be equal for two cross-process
    // renames on low-resolution Windows/network filesystems.
    // An absent/corrupted store is a hard error, not permission to overwrite
    // previously persisted data from a stale in-memory snapshot.
    let contents;
    try { contents = await fs.readFile(this.filePath, "utf8"); }
    catch (error) { throw new Error(`RunStore is unavailable: ${this.filePath}: ${error.message}`); }
    try { this._state = this._validateState(JSON.parse(contents)); }
    catch (error) { throw new Error(`RunStore reload failed: ${this.filePath}: ${error.message}`); }
    try { this._lastWriteMtime = (await fs.stat(this.filePath)).mtimeMs; } catch {}
  }

  async _windowsLockEpermIsContention() {
    // Windows may surface a contended exclusive create as EPERM. Distinguish
    // that from a genuine directory ACL failure by proving we can create a
    // sibling file in the same directory. This avoids both false failures
    // under contention and misleading lock timeouts on real permission errors.
    const probePath = `${this.lockPath}.${process.pid}.${crypto.randomUUID()}.probe`;
    let handle;
    try {
      handle = await fs.open(probePath, "wx", 0o600);
      return true;
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error?.code)) return false;
      throw error;
    } finally {
      try { await handle?.close(); } catch { /* best-effort */ }
      try { await fs.unlink(probePath); } catch (error) { if (error?.code !== "ENOENT") { /* best-effort */ } }
    }
  }

  async _acquireFileLock() {
    const startedAt = Date.now();
    const token = `${process.pid}-${crypto.randomUUID()}`;
    while (true) {
      try {
        const handle = await fs.open(this.lockPath, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
        } finally {
          await handle.close();
        }
        return async () => this._releaseFileLock(token);
      } catch (error) {
        // On Windows, opening an existing/contended lock with "wx" may
        // surface as EPERM instead of EEXIST. Treat EPERM as contention only
        // when the lock path can actually be observed; otherwise preserve the
        // real permission error.
        let contended = error?.code === "EEXIST";
        if (!contended && error?.code === "EPERM" && process.platform === "win32") {
          try {
            await fs.stat(this.lockPath);
            contended = true;
          } catch (statError) {
            if (statError?.code === "ENOENT") {
              // Owner released between open() and stat(); retry acquisition.
              contended = true;
            } else if (statError?.code === "EPERM") {
              // Some Windows/Node combinations also deny stat() while another
              // process owns the file. Verify the directory itself is writable
              // before classifying the original EPERM as contention.
              contended = await this._windowsLockEpermIsContention();
              if (!contended) throw error;
            } else {
              throw error;
            }
          }
        }
        if (!contended) throw error;
        if (await this._isStaleFileLock()) {
          try { await fs.unlink(this.lockPath); } catch (unlinkError) { if (unlinkError?.code !== "ENOENT") throw unlinkError; }
          continue;
        }
        if (Date.now() - startedAt >= this.lockTimeoutMs) {
          const timeout = new Error(`RunStore lock timed out: ${this.lockPath}`);
          timeout.code = "RUN_STORE_LOCK_TIMEOUT";
          throw timeout;
        }
        await sleep(this.lockRetryMs);
      }
    }
  }

  async _isStaleFileLock() {
    let stat;
    let lock = null;
    try {
      stat = await fs.stat(this.lockPath);
      lock = JSON.parse(await fs.readFile(this.lockPath, "utf8"));
    } catch (error) {
      // ENOENT means the observed owner already released its lock. Returning
      // "stale" here is unsafe: another process may acquire a fresh lock
      // between this check and the caller's unlink, causing that fresh owner
      // to be deleted. Let the acquisition loop retry instead.
      if (error?.code === "ENOENT") return false;
      // A malformed lock is removable only after the stale threshold.
      try { stat = stat || await fs.stat(this.lockPath); } catch { return false; }
    }

    const ownerPid = Number(lock?.pid);
    if (Number.isInteger(ownerPid) && ownerPid > 0) {
      try {
        process.kill(ownerPid, 0);
        return false;
      } catch (error) {
        if (error?.code === "ESRCH") return true;
        if (error?.code === "EPERM") return false;
      }
    }
    return Date.now() - stat.mtimeMs >= this.lockStaleMs;
  }

  async _releaseFileLock(token) {
    let current;
    try {
      current = JSON.parse(await fs.readFile(this.lockPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return;
      // If the lock cannot be parsed, ownership cannot be proven. Never
      // remove it from a release path; stale-lock recovery handles it later.
      if (error instanceof SyntaxError) return;
      throw error;
    }
    // Never unlink a lock that was replaced by another owner.
    if (current?.token !== token) return;
    try {
      await fs.unlink(this.lockPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  _validateState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) throw new Error(`RunStore data has an unsupported schema: ${this.filePath}`);
    // `terminals` is an optional, additive collection in the v1 file format.
    // Older runtime files stay readable and receive it on their next mutation.
    if (!Array.isArray(state.missions)) state.missions = [];
    if (!Array.isArray(state.terminals)) state.terminals = [];
    if (!Array.isArray(state.evidence)) state.evidence = [];
    if (!Array.isArray(state.projectSnapshots)) state.projectSnapshots = [];
    if (!Array.isArray(state.intentSessions)) state.intentSessions = [];
    if (!Array.isArray(state.missionBriefs)) state.missionBriefs = [];
    if (!Array.isArray(state.taskGraphs)) state.taskGraphs = [];
    if (!Array.isArray(state.attention)) state.attention = [];
    if (state.runSubmissions === undefined) state.runSubmissions = [];
    if (state.executableManifests === undefined) state.executableManifests = [];
    if (!Array.isArray(state.executableManifests)) throw new Error("RunStore executable manifests are invalid");
    const manifestIds = new Set();
    for (const row of state.executableManifests) {
      validateStoredExecutableManifest(row);
      if (manifestIds.has(row.id)) throw new Error("RunStore has duplicate executable manifest");
      manifestIds.add(row.id);
    }
    validateAdmissionLedger(state.runSubmissions);
    for (const collection of COLLECTIONS) {
      if (!Array.isArray(state[collection])) throw new Error(`RunStore data is missing collection: ${collection}`);
    }
    return state;
  }

  async _syncParentDirectory() {
    // POSIX durability requires the directory entry created by rename() to be
    // synced as well. Windows does not expose portable directory fsync
    // semantics through Node, so the durable temp-file sync remains the
    // strongest portable guarantee there.
    if (process.platform === "win32") return;
    let directoryHandle;
    try {
      directoryHandle = await fs.open(path.dirname(this.filePath), "r");
      await directoryHandle.sync();
    } catch (error) {
      if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM"].includes(error?.code)) throw error;
    } finally {
      try { await directoryHandle?.close(); } catch { /* best-effort close */ }
    }
  }

  async _flush() {
    const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporaryPath, "w", 0o600);
      await handle.writeFile(`${JSON.stringify(this._state, null, 2)}\n`, "utf8");
      // Atomic rename prevents readers from seeing a partial generation, but
      // it does not make the temp file's data durable across a crash. Sync the
      // file before publishing the new generation.
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporaryPath, this.filePath);
      await this._syncParentDirectory();
      try { await fs.chmod(this.filePath, 0o600); } catch { /* Windows does not implement POSIX modes. */ }
      try { this._lastWriteMtime = (await fs.stat(this.filePath)).mtimeMs; } catch { /* best-effort */ }
    } catch (error) {
      try { await handle?.close(); } catch { /* preserve original error */ }
      try { await fs.unlink(temporaryPath); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") { /* best-effort cleanup */ } }
      throw error;
    }
  }
}

module.exports = { COLLECTIONS, JsonFileRunStore };
