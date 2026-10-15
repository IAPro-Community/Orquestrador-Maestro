"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { RunStore } = require("./run-store");

const COLLECTIONS = Object.freeze(["projects", "missions", "tasks", "runs", "steps", "executions", "events", "artifacts", "evidence", "verifications", "terminals", "projectSnapshots", "intentSessions", "missionBriefs", "taskGraphs", "attention"]);

function emptyState() {
  return { version: 1, projects: [], missions: [], tasks: [], runs: [], steps: [], executions: [], events: [], artifacts: [], evidence: [], verifications: [], terminals: [], projectSnapshots: [], intentSessions: [], missionBriefs: [], taskGraphs: [], attention: [] };
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
    await this.initialize();
    await this._reloadIfChanged();
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
    await this.initialize();
    await this._reloadIfChanged();
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
    await this.initialize();
    await this._reloadIfChanged();
    if (typeof id !== "string" || id.trim() === "") throw new TypeError("id must be a non-empty string");
    const record = this._state[collection].find((entry) => entry.id === id);
    return record ? clone(record) : undefined;
  }

  async _list(collection, filters = {}, allowed) {
    assertKnownCollection(collection);
    await this.initialize();
    await this._reloadIfChanged();
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
        // committed file, never on a stale in-memory snapshot.
        await this._reloadFromDisk({ createIfMissing: true });
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
    if (this._lastWriteMtime === null) return;
    let stat;
    try {
      stat = await fs.stat(this.filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (stat.mtimeMs === this._lastWriteMtime) return;
    await this._reloadFromDisk();
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
