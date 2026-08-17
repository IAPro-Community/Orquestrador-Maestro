"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { RunStore } = require("./run-store");

const COLLECTIONS = Object.freeze(["projects", "missions", "tasks", "runs", "steps", "executions", "events", "artifacts", "verifications", "terminals", "projectSnapshots", "intentSessions", "missionBriefs", "taskGraphs"]);

function emptyState() {
  return { version: 1, projects: [], missions: [], tasks: [], runs: [], steps: [], executions: [], events: [], artifacts: [], verifications: [], terminals: [], projectSnapshots: [], intentSessions: [], missionBriefs: [], taskGraphs: [] };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function assertRecord(record, label) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError(`${label} must be an object`);
  if (typeof record.id !== "string" || record.id.trim() === "") throw new TypeError(`${label}.id must be a non-empty string`);
}

function assertKnownCollection(collection) {
  if (!COLLECTIONS.includes(collection)) throw new TypeError(`unknown RunStore collection: ${collection}`);
}

/**
 * Portable operational persistence for the initial runtime. This intentionally
 * uses no native SQLite dependency: it is Node 18-compatible on Windows,
 * Linux, and macOS. Each mutation atomically replaces one private JSON file.
 */
class JsonFileRunStore extends RunStore {
  constructor({ filePath } = {}) {
    super();
    if (typeof filePath !== "string" || filePath.trim() === "") throw new TypeError("filePath must be a non-empty string");
    this.filePath = path.resolve(filePath);
    this._state = null;
    this._mutation = Promise.resolve();
    this._lastWriteMtime = null;
  }

  async initialize() {
    if (this._state) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      this._state = this._validateState(JSON.parse(contents));
      this._lastWriteMtime = (await fs.stat(this.filePath)).mtimeMs;
    } catch (error) {
      if (error && error.code === "ENOENT") {
        this._state = emptyState();
        await this._flush();
      } else if (error instanceof SyntaxError) {
        throw new Error(`RunStore data is invalid JSON: ${this.filePath}`);
      } else {
        throw error;
      }
    }
  }

  async createProject(project) { return this._save("projects", project); }
  async saveMission(mission) { return this._save("missions", mission); }
  async saveTask(task) { return this._save("tasks", task); }
  async saveRun(run) { return this._save("runs", run); }
  async saveStep(step) { return this._save("steps", step); }
  async saveExecution(execution) { return this._save("executions", execution); }
  async saveArtifact(artifact) { return this._save("artifacts", artifact); }
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
  async getVerification(id) { return this._get("verifications", id); }
  async getTerminal(id) { return this._get("terminals", id); }

  async getLatestProjectSnapshot(projectId) {
    await this.initialize();
    if (typeof projectId !== "string" || projectId.trim() === "") throw new TypeError("projectId must be a non-empty string");
    const snapshots = this._state.projectSnapshots.filter(s => s.projectId === projectId);
    if (snapshots.length === 0) throw new Error(`Project snapshot not found for project: ${projectId}`);
    return clone(snapshots[snapshots.length - 1]);
  }

  async getIntentSession(id) { return this._get("intentSessions", id); }
  async getMissionBrief(id) { return this._get("missionBriefs", id); }
  async getTaskGraph(id) { return this._get("taskGraphs", id); }

  async listProjects() { return this._list("projects"); }
  async listMissions(filters) { return this._list("missions", filters, ["projectId", "status", "mode"]); }
  async listTasks(filters) { return this._list("tasks", filters); }
  async listRuns(filters = {}) {
    await this.initialize();
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
  async listVerifications(filters) { return this._list("verifications", filters); }
  async listTerminals(filters) { return this._list("terminals", filters, ["projectId", "kind", "backend", "status", "providerId"]); }

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
    if (typeof id !== "string" || id.trim() === "") throw new TypeError("id must be a non-empty string");
    const record = this._state[collection].find((entry) => entry.id === id);
    return record ? clone(record) : undefined;
  }

  async _list(collection, filters = {}, allowed) {
    assertKnownCollection(collection);
    await this.initialize();
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
      await this._reloadIfChanged();
      return operation();
    });
    this._mutation = next.catch(() => undefined);
    return next;
  }

  /**
   * Reloads the persisted state before a mutation when another process wrote
   * the file since our last read/flush. Prevents last-writer-wins clobbering
   * of concurrent runtime instances sharing the same run store file.
   */
  async _reloadIfChanged() {
    if (this._lastWriteMtime === null) return;
    let stat;
    try {
      stat = await fs.stat(this.filePath);
    } catch {
      return; // file is absent or unreadable; keep current state
    }
    if (stat.mtimeMs === this._lastWriteMtime) return;
    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      this._state = this._validateState(JSON.parse(contents));
      this._lastWriteMtime = stat.mtimeMs;
    } catch {
      // Unreadable or invalid external write: keep current in-memory state.
    }
  }

  _validateState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state) || state.version !== 1) throw new Error(`RunStore data has an unsupported schema: ${this.filePath}`);
    // `terminals` is an optional, additive collection in the v1 file format.
    // Older runtime files stay readable and receive it on their next mutation.
    if (!Array.isArray(state.missions)) state.missions = [];
    if (!Array.isArray(state.terminals)) state.terminals = [];
    if (!Array.isArray(state.projectSnapshots)) state.projectSnapshots = [];
    if (!Array.isArray(state.intentSessions)) state.intentSessions = [];
    if (!Array.isArray(state.missionBriefs)) state.missionBriefs = [];
    if (!Array.isArray(state.taskGraphs)) state.taskGraphs = [];
    for (const collection of COLLECTIONS) {
      if (!Array.isArray(state[collection])) throw new Error(`RunStore data is missing collection: ${collection}`);
    }
    return state;
  }

  async _flush() {
    const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(this._state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryPath, this.filePath);
    try { await fs.chmod(this.filePath, 0o600); } catch { /* Windows does not implement POSIX modes. */ }
    try { this._lastWriteMtime = (await fs.stat(this.filePath)).mtimeMs; } catch { /* best-effort */ }
  }
}

module.exports = { COLLECTIONS, JsonFileRunStore };
