"use strict";

const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core");
const { runtimeTaskId, semanticTaskIdOf, storedTaskSemanticId } = require("../core/task-identity");
const { diff, snapshot } = require("../git/monitor");
const { AgyAdapter, CodexAdapter, ClaudeAdapter, OpenCodeAdapter } = require("../providers");
const { getPolicy, getProfile } = require("../profiles");
const { SkillRegistry } = require("../skills/registry");
const { JsonFileRunStore } = require("../store");
const { TerminalManager, TerminalSessionManager } = require("../terminals");
const { VerificationEngine, inferCommands } = require("../verification/engine");
const { WorkspaceManager } = require("../workspaces/manager");
const { compactContext } = require("../planner/context-compactor");
const { buildEngineeringContract, detectQualityFindings } = require("../governance/engineering-quality");
const { isTaskCompletionEligible, isRiskExecutionEligible, evaluateCognitiveBudget, classifyChange } = require("../governance/change-governance");
const { reviewRequired, buildReviewPrompt, parseReviewResult } = require("../governance/independent-review");
const { mergeConfig, loadGovernanceConfig, writeGovernanceConfig, buildGovernance } = require("../governance/compatibility");
const { resolveProjectMaestroRoot } = require("../config/maestro-paths");
const { resolveInteractionProfile, interactionContract } = require("../interaction");
const { parseProviderUsage } = require("../telemetry/provider-usage");
const { extractChildAgents } = require("../telemetry/agent-topology");
const { buildCognitiveTelemetry } = require("../telemetry/cognitive-telemetry");
const {
  buildMaestroPromptManifest,
  createResolution,
  finalizeResolution,
  resolutionProjection,
  buildResolutionTelemetry,
  createBudgetReservation,
  commitBudgetReservation,
  releaseBudgetReservation,
  withBudgetReservation,
  buildTaskProofBundle,
  buildMissionProofBundle,
  buildProviderCheckpoint,
  checkpointPrompt,
  classifyResolutionFailure
} = require("../resolution");
const { sanitizeDiagnostic } = require("../telemetry/diagnostic-sanitizer");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function projectIdForPath(workspacePath) { return `project-${crypto.createHash("sha256").update(path.resolve(workspacePath)).digest("hex").slice(0, 16)}`; }


// Ephemeral provider stream vs durable telemetry contract:
// - provider.started / provider.output / provider.completed carry raw chunks
//   and live in memory for UI/subscribers only; they are NEVER persisted.
// - run.output per-chunk is likewise ephemeral. There is NO durable raw
//   output snapshot by design (privacy contract): raw provider/terminal
//   output stays in live-process memory so replay works for connected
//   subscribers; replay after restart is NOT promised (see FOLLOW-UP below).
// - Durable points: run.created/started/completed/failed/blocked,
//   execution lifecycle (sanitized), review.*, artifact.created,
//   verification.*, usage summaries, agent topology.
// FOLLOW-UP (not this PR): if post-restart replay becomes a requirement, it
// needs a privacy-reviewed design first — never raw ANSI in the RunStore.
const EPHEMERAL_EVENT_TYPES = new Set(["provider.started", "provider.output", "provider.completed", "run.output", "terminal.output", "agentSession.output"]);

function sanitizeProviderError(message) {
  // Durable error strings flow into execution metadata and run events, so
  // they go through the shared diagnostic sanitizer (tokens, keys, cookies,
  // connection strings, credentials, emails, absolute home paths). Callers
  // must still never pass prompt/output content in.
  return sanitizeDiagnostic(message, { maxChars: 2000 });
}

function durableExecutionSummary(result, { providerId } = {}) {
  return Object.freeze({
    providerId: providerId || result?.providerId || "unknown",
    pid: typeof result?.pid === "number" ? result.pid : null,
    exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null,
    signal: typeof result?.signal === "string" ? result.signal : null,
    cancelled: result?.cancelled === true,
    timedOut: result?.timedOut === true,
    durationMs: Number.isFinite(result?.durationMs) ? result.durationMs : null,
    ...(result?.error ? { error: sanitizeProviderError(result.error) } : {})
  });
}

function gitIdentityForTelemetry(workspacePath) {
  try {
    const ctx = resolveGitContext(workspacePath);
    return { repositoryId: ctx.repositoryId || "unknown", branch: ctx.branch || "unknown", headCommit: ctx.headCommit || "unknown" };
  } catch {
    return { repositoryId: "unknown", branch: "unknown", headCommit: "unknown" };
  }
}

function blockedTelemetry({ budget, projectId, workspacePath, reason, skillsRequested = 0, skillsResolved = 0 }) {
  const identity = gitIdentityForTelemetry(workspacePath || process.cwd());
  return buildCognitiveTelemetry({
    budget,
    primaryUsage: null,
    reviewUsage: null,
    skillsRequested,
    skillsResolved,
    skillsLoaded: 0,
    outcome: "blocked",
    reason,
    projectId,
    repositoryId: identity.repositoryId,
    branch: identity.branch,
    headCommit: identity.headCommit,
    status: "blocked"
  });
}


function evidenceText(value) {
  let text;
  if (typeof value === "string" && value.trim()) text = value;
  else {
    try {
      const serialized = JSON.stringify(value);
      text = serialized && serialized !== "{}" ? serialized : "evidence";
    } catch {
      text = "evidence";
    }
  }
  return sanitizeDiagnostic(text, { maxChars: 4000 });
}

function sanitizeEvidenceMetadata(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (depth >= 5) return "[truncated]";
  if (typeof value === "string") return sanitizeDiagnostic(value, { maxChars: 1000 });
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeEvidenceMetadata(item, depth + 1));
  if (typeof value !== "object") return sanitizeDiagnostic(String(value), { maxChars: 1000 });
  const sanitized = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) continue;
    sanitized[key.slice(0, 128)] = sanitizeEvidenceMetadata(item, depth + 1);
  }
  const serialized = JSON.stringify(sanitized);
  return serialized.length <= 12000
    ? sanitized
    : { truncated: true, summary: sanitizeDiagnostic(serialized, { maxChars: 8000 }) };
}

function criterionText(value) {
  const raw = typeof value === "string"
    ? value.trim()
    : value && typeof value === "object"
      ? String(value.id || value.condition || "").trim()
      : "";
  return raw ? sanitizeDiagnostic(raw, { maxChars: 512 }) : undefined;
}

function evidenceLabel(value, fallback, maxChars = 128) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return sanitizeDiagnostic(raw, { maxChars }) || fallback;
}

function hashText(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function durableChangeArtifactMetadata(before, changes = {}) {
  // Review needs full patches only in memory. Persisting them in runs.json
  // duplicates source code, grows every atomic rewrite, and can retain
  // accidental secrets from otherwise non-sensitive files. Proof keeps
  // filenames/stats/omissions plus hashes that bind it to the reviewed bytes.
  return Object.freeze({
    before: {
      available: before?.available === true,
      files: Array.isArray(before?.files) ? before.files.slice(0, 1000).map((item) => ({
        status: item?.status || null,
        path: typeof item?.path === "string" ? sanitizeDiagnostic(item.path, { maxChars: 512 }) : null,
        previousPath: typeof item?.previousPath === "string" ? sanitizeDiagnostic(item.previousPath, { maxChars: 512 }) : undefined
      })) : []
    },
    changes: {
      available: changes?.available === true,
      patchComplete: changes?.patchComplete === true,
      changedFiles: Array.isArray(changes?.changedFiles) ? changes.changedFiles.slice(0, 1000).map((value) => sanitizeDiagnostic(value, { maxChars: 512 })) : [],
      stats: sanitizeEvidenceMetadata(changes?.stats || []),
      stagedStats: sanitizeEvidenceMetadata(changes?.stagedStats || []),
      untrackedFiles: Array.isArray(changes?.untrackedFiles) ? changes.untrackedFiles.slice(0, 1000).map((value) => sanitizeDiagnostic(value, { maxChars: 512 })) : [],
      binaryFiles: sanitizeEvidenceMetadata(changes?.binaryFiles || []),
      sensitiveFiles: sanitizeEvidenceMetadata(changes?.sensitiveFiles || []),
      omitted: sanitizeEvidenceMetadata(changes?.omitted || []),
      limits: sanitizeEvidenceMetadata(changes?.limits || {}),
      truncated: changes?.truncated === true,
      patchHashes: {
        workingTree: hashText(changes?.workingTreePatch),
        staged: hashText(changes?.stagedPatch),
        combined: hashText(changes?.patch)
      },
      patchBytes: {
        workingTree: typeof changes?.workingTreePatch === "string" ? Buffer.byteLength(changes.workingTreePatch, "utf8") : null,
        staged: typeof changes?.stagedPatch === "string" ? Buffer.byteLength(changes.stagedPatch, "utf8") : null,
        combined: typeof changes?.patch === "string" ? Buffer.byteLength(changes.patch, "utf8") : null
      }
    }
  });
}

function normalizeProviderAttempts(request = {}) {
  const raw = [
    { providerId: request.providerId || "codex", model: request.model },
    ...(Array.isArray(request.providerFallbacks) ? request.providerFallbacks : [])
  ];
  const seen = new Set();
  const attempts = [];
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    const providerId = typeof value === "string"
      ? value.trim()
      : typeof value?.providerId === "string"
        ? value.providerId.trim()
        : typeof value?.id === "string"
          ? value.id.trim()
          : "";
    if (!providerId || seen.has(providerId)) continue;
    seen.add(providerId);
    const model = index === 0 && typeof value !== "object"
      ? request.model
      : value && typeof value === "object" && typeof value.model === "string" && value.model.trim()
        ? value.model.trim()
        : undefined;
    attempts.push(Object.freeze({ providerId, model }));
  }
  return Object.freeze(attempts);
}

function listSourceFiles(workspacePath, relativePath = "") {
  const directory = path.join(workspacePath, relativePath);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", ".orquestrador", ".orquestrador-maestro", "node_modules"].includes(entry.name)) return [];
    if (entry.isSymbolicLink()) return [];
    const childPath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) return listSourceFiles(workspacePath, childPath);
    return /\.(?:js|jsx|ts|tsx|mjs|cjs)$/u.test(entry.name) ? [childPath] : [];
  });
}

function filesForQualityReview(workspacePath) {
  const gitSnapshot = snapshot(workspacePath);
  if (gitSnapshot.available) return gitSnapshot.files.map(({ path: filePath }) => filePath);
  return listSourceFiles(workspacePath);
}

class ProviderRegistry {
  constructor(adapters = [new CodexAdapter(), new ClaudeAdapter(), new AgyAdapter(), new OpenCodeAdapter()]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }
  get(id) { return this.adapters.get(id) || null; }
  async list() {
    return Promise.all([...this.adapters.values()].map(async (adapter) => ({
      ...(await adapter.detect()), capabilities: await adapter.capabilities()
    })));
  }
}

class MaestroApplication {
  constructor(options = {}) {
    this.projectRoot = path.resolve(options.projectRoot || process.cwd());
    const runFile = options.runFile || path.join(resolveProjectMaestroRoot(this.projectRoot), "runtime", "runs.json");
    this.store = options.store || new JsonFileRunStore({ filePath: runFile });
    this.providers = options.providers || new ProviderRegistry();
    this.skills = options.skills || new SkillRegistry({ maestroRoot: options.maestroRoot, projectRoot: this.projectRoot });
    this.verification = options.verification || new VerificationEngine();
    this.events = new EventEmitter();
    this.activeRuns = new Map();
    this.panes = new Map();
    this.workspaces = options.workspaces || new WorkspaceManager();
    this.terminals = options.terminals || new TerminalManager({ store: this.store, emitEvent: (runId, type, data) => this.record(runId, type, data) });
    this.terminalSessions = options.terminalSessions || new TerminalSessionManager({ store: this.store, emitEvent: (runId, type, data) => this.record(runId, type, data) });
    this.governance = mergeConfig(options.governance || loadGovernanceConfig({ cwd: this.projectRoot }).config);
    // Enforce mode is a runtime-owned capability. A request/Bridge client
    // cannot self-authorize promotion by setting a payload boolean.
    this.resolutionEnforceAuthorized = options.resolutionEnforceAuthorized === true;
    this.interaction = options.interaction || resolveInteractionProfile({ cwd: this.projectRoot, cliProfile: options.interactionProfile });
    this.governanceWarnings = new Set();
    this.governanceNotices = [];
  }

  async initialize() { await this.store.initialize(); return this; }
  getGovernanceStatus() {
    return {
      nativeTone: "preserved",
      governance: this.governance.mode,
      hooksActive: this.governance.hooks.enabled ? 1 : 0,
      pendingWarnings: this.governanceNotices.length,
      providerModel: "informational"
    };
  }
  getInteractionProfile() { return this.interaction; }
  updateGovernance(patch = {}) {
    const written = writeGovernanceConfig({ cwd: this.projectRoot, patch });
    this.governance = written.config;
    return this.getGovernanceStatus();
  }
  async listProviders() { return this.providers.list(); }
  async listRuns(filters = {}) {
    const resolved = { ...filters };
    if (resolved.projectPath && !resolved.projectId) resolved.projectId = projectIdForPath(resolved.projectPath);
    delete resolved.projectPath;
    return this.store.listRuns(resolved);
  }
  async getRun(runId) { return this.store.getRun(runId); }
  async getTask(taskId) { return this.store.getTask(taskId); }
  async listTasks(filters) { return this.store.listTasks(filters); }
  async getTaskOutcomeHistory(taskId) {
    const task = await this.store.getTask(taskId);
    const ids = new Set([taskId]);
    const missionId = task?.metadata?.missionId || null;
    const semanticTaskId = task ? storedTaskSemanticId(task) : null;
    if (missionId && semanticTaskId) {
      for (const candidate of await this.store.listTasks({})) {
        if (candidate?.metadata?.missionId === missionId && storedTaskSemanticId(candidate) === semanticTaskId) {
          ids.add(candidate.id);
        }
      }
    }
    const runs = (await Promise.all([...ids].map((id) => this.store.listRuns({ taskId: id })))).flat();
    const uniqueRuns = [...new Map(runs.map((run) => [run.id, run])).values()];
    return Object.freeze(uniqueRuns
      .filter((run) => run.metadata?.resolution?.outcome)
      .sort((a, b) => String(a.completedAt || a.startedAt || "").localeCompare(String(b.completedAt || b.startedAt || "")))
      .map((run) => Object.freeze({
        runId: run.id,
        status: run.status,
        completedAt: run.completedAt || null,
        outcome: run.metadata.resolution.outcome
      })));
  }
  async listProjects() {
    const projects = await this.store.listProjects();
    return Promise.all(projects.map((project) => this.inspectProject({ projectId: project.id })));
  }
  async getProject(projectId) { return this.store.getProject(projectId); }
  async listMissions(filters = {}) { return this.store.listMissions(filters); }
  async getMission(missionId) { return this.store.getMission(missionId); }
  async createMission(request = {}) {
    await this.initialize();
    if (typeof request.objective !== "string" || request.objective.trim() === "") throw new TypeError("objective is required");
    const workspacePath = path.resolve(request.workspacePath || this.projectRoot);
    const projectId = request.projectId || projectIdForPath(workspacePath);
    if (!await this.store.getProject(projectId)) {
      await this.store.createProject({ id: projectId, path: workspacePath, name: path.basename(workspacePath), createdAt: new Date().toISOString() });
    }
    const mission = core.createMission({
      id: id("mission"), projectId, objective: request.objective,
      mode: request.mode, status: request.status, plan: request.plan,
      createdAt: new Date().toISOString(), startedAt: request.startedAt, metadata: request.metadata
    });
    await this.store.saveMission(mission);
    await this.record(null, "mission.created", { missionId: mission.id, projectId, mode: mission.mode });
    return mission;
  }
  async updateMission(missionId, patch = {}) {
    await this.initialize();
    const current = await this.store.getMission(missionId);
    if (!current) return null;
    const next = core.createMission({ ...current, ...patch, id: current.id, projectId: current.projectId, objective: current.objective });
    await this.store.saveMission(next);
    await this.record(null, "mission.updated", { missionId, status: next.status });
    return next;
  }
  async registerProject({ projectPath } = {}) {
    if (typeof projectPath !== "string" || projectPath.trim() === "") throw new TypeError("projectPath is required");
    await this.initialize();
    const workspacePath = path.resolve(projectPath);
    const project = { id: projectIdForPath(workspacePath), path: workspacePath, name: path.basename(workspacePath), createdAt: new Date().toISOString() };
    await this.store.createProject(project);
    return this.inspectProject({ projectId: project.id });
  }
  async inspectProject({ projectId, projectPath } = {}) {
    await this.initialize();
    const resolvedPath = projectPath ? path.resolve(projectPath) : null;
    const idToUse = projectId || (resolvedPath ? projectIdForPath(resolvedPath) : projectIdForPath(this.projectRoot));
    const stored = await this.store.getProject(idToUse);
    const workspacePath = stored?.path || resolvedPath || this.projectRoot;
    const runs = await this.store.listRuns({ projectId: idToUse });
    const latestRun = runs.slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))[0] || null;
    const git = snapshot(workspacePath);
    const verification = latestRun ? await this.getVerification(latestRun.id) : null;
    const resolution = latestRun ? resolutionProjection(latestRun) : null;
    const status = resolution?.state === "validated" ? "healthy"
      : resolution?.state === "blocked" ? "blocked"
        : resolution?.state === "needs_attention" ? "needs_attention"
          : resolution?.state === "failed" && verification?.status === "failed" ? "verification_failed"
            : resolution?.state === "failed" ? "needs_attention"
              : resolution?.state === "running" || resolution?.state === "verifying" ? resolution.state
                : git.available && git.files.length > 0 ? "changes_detected" : "idle";
    return {
      id: idToUse, path: workspacePath, name: stored?.name || path.basename(workspacePath), known: Boolean(stored),
      status, latestRun, resolution, verification, git, runCount: runs.length
    };
  }
  async inspectRun(runId) {
    const run = await this.getRun(runId); if (!run) return null;
    const task = await this.getTask(run.taskId);
    return { run, task, project: task?.projectId ? await this.getProject(task.projectId) : null,
      resolution: resolutionProjection(run),
      steps: await this.store.listSteps({ runId }), executions: await this.store.listExecutions({ runId }),
      artifacts: await this.listArtifacts({ runId }), verification: await this.getVerification(runId),
      events: await this.store.listEvents({ runId }) };
  }
  async listArtifacts(filters) { return this.store.listArtifacts(filters); }
  async getArtifact(artifactId) { return this.store.getArtifact(artifactId); }
  async listEvidence(filters = {}) { return this.store.listEvidence(filters); }
  async getEvidence(evidenceId) { return this.store.getEvidence(evidenceId); }
  async getTaskProofBundle(taskId) { return buildTaskProofBundle({ store: this.store, taskId }); }
  async getMissionProofBundle(missionId) { return buildMissionProofBundle({ store: this.store, missionId }); }
  async getVerification(runId) {
    const values = await this.store.listVerifications({ runId });
    return values.length ? values[values.length - 1] : undefined;
  }
  async listTerminals(filters = {}) {
    const terminals = await this.store.listTerminals(filters);
    return terminals.map((terminal) => terminal.status === "running" && !this.terminals.active.has(terminal.id)
      ? { ...terminal, status: "detached", notice: "A sessão ao vivo pertence a outro processo Maestro ou já foi encerrada." } : terminal);
  }
  async getTerminal(terminalId) { return this.store.getTerminal(terminalId); }
  async listTerminalSessions(filters = {}) { return this.terminalSessions.list(filters); }
  async getTerminalSession(terminalId) { return this.terminalSessions.get(terminalId); }
  terminalCapabilities() { return this.terminalSessions.capabilities(); }
  async createTerminalSession(request) {
    await this.initialize();
    const sourceWorkspacePath = path.resolve(request?.workspacePath || this.projectRoot);
    const projectId = request?.projectId || projectIdForPath(sourceWorkspacePath);
    const project = await this.store.getProject(projectId);
    if (!project) await this.store.createProject({ id: projectId, path: sourceWorkspacePath, name: path.basename(sourceWorkspacePath), createdAt: new Date().toISOString() });
    const kind = request?.kind || "shell";
    const isolation = request?.isolation || (kind === "agent" ? "worktree" : "shared");
    if (!["worktree", "shared"].includes(isolation)) throw new TypeError("isolation must be worktree or shared");
    let workspacePath = sourceWorkspacePath; let workspaceId;
    const sessionId = `agent-session-${crypto.randomUUID()}`;
    if (kind === "agent" && isolation === "worktree") {
      let workspace;
      try { workspace = await this.workspaces.createSessionWorktree({ repositoryPath: sourceWorkspacePath, projectId, sessionId }); }
      catch (error) { const wrapped = new Error(`Não foi possível criar o worktree do agente: ${error.message}`); wrapped.code = "AGENT_WORKTREE_FAILED"; throw wrapped; }
      workspacePath = workspace.path; workspaceId = workspace.id;
    }
    return this.terminalSessions.create({ ...request, sessionId, projectId, workspacePath, sourceWorkspacePath, workspaceId, isolation });
  }
  async attachTerminalSession(terminalId) { return this.terminalSessions.attach(terminalId); }
  async closeTerminalSession(terminalId) { return this.terminalSessions.close(terminalId); }
  async registerTerminalClient(request) { return this.terminalSessions.registerClient(request); }
  async updateTerminalClientStatus(request) { return this.terminalSessions.updateClientStatus(request); }
  async inputTerminalSession(terminalId, input) { return this.terminalSessions.input(terminalId, input); }
  async resizeTerminalSession(terminalId, columns, rows) { return this.terminalSessions.resize(terminalId, columns, rows); }
  async focusTerminalSession(terminalId) { return this.terminalSessions.focus(terminalId); }
  async snapshotTerminalSession(terminalId, options = {}) { return this.terminalSessions.snapshot(terminalId, options.afterSequence || 0); }
  async dashboard({ projectId, projectPath } = {}) {
    const project = await this.inspectProject({ projectId, projectPath });
    const [projects, missions, sessions] = await Promise.all([
      this.listProjects(), this.listMissions({ projectId: project.id }), this.listTerminalSessions({ projectId: project.id })
    ]);
    const activeMission = missions.find((mission) => ["running", "planning", "blocked", "verifying"].includes(mission.status)) || missions[0] || null;
    return { projects, project, mission: activeMission, missions, sessions, panes: await this.listPanes({ projectId: project.id }), runtime: { pty: this.terminalCapabilities().backends.pty } };
  }
  async listPanes({ projectId } = {}) {
    const sessions = await this.listTerminalSessions(projectId ? { projectId } : {});
    return sessions.filter((session) => session.backend === "pty").map((session, index) => ({ terminalId: session.id, page: Math.floor(index / 6), slot: index % 6, ...(this.panes.get(session.id) || {}) }));
  }
  async updatePane(terminalId, patch = {}) {
    if (!await this.getTerminalSession(terminalId)) return null;
    const current = this.panes.get(terminalId) || {};
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.panes.set(terminalId, next); await this.record(null, "pane.updated", { terminalId, ...next }); return { terminalId, ...next };
  }
  async pagePanes({ projectId, page = 0 } = {}) {
    if (!Number.isInteger(page) || page < 0) throw new TypeError("page must be a non-negative integer");
    return (await this.listPanes({ projectId })).filter((pane) => pane.page === page);
  }
  async startTerminal(request) {
    await this.initialize();
    const workspacePath = path.resolve(request?.workspacePath || this.projectRoot);
    const projectId = request?.projectId || projectIdForPath(workspacePath);
    const project = await this.store.getProject(projectId);
    if (!project) await this.store.createProject({ id: projectId, path: workspacePath, name: path.basename(workspacePath), createdAt: new Date().toISOString() });
    return this.terminals.start({ projectId, cwd: workspacePath, command: request?.command, args: request?.args || [] });
  }
  async stopTerminal(terminalId) { return this.terminals.stop(terminalId); }
  async waitTerminal(terminalId) { return this.terminals.wait(terminalId); }
  async sendTerminalInput(terminalId, input) { return this.terminals.sendInput(terminalId, input); }
  subscribe(listener) { this.events.on("event", listener); return () => this.events.off("event", listener); }

  async createRun(request) {
    await this.initialize();
    if (!request || typeof request.description !== "string" || request.description.trim() === "") throw new TypeError("description is required");
    const provider = this.providers.get(request.providerId || "codex");
    if (!provider) throw new Error(`provider unavailable: ${request.providerId || "codex"}`);
    const installation = await provider.detect();
    if (!installation.installed) throw new Error(`provider not installed: ${provider.id}`);
    const policy = getPolicy(request.policyId || "standard");
    const semanticChange = classifyChange({
      text: request.description,
      paths: Array.isArray(request.semanticTask?.paths) ? request.semanticTask.paths : [],
      changeClass: request.semanticTask?.changeClass
    });
    const semanticChangeClass = semanticChange.changeClass;
    const semanticRisk = request.semanticTask?.risk || (semanticChange.highRisk ? "high" : undefined);
    const derivedProfileId = request.profileId || "developer";
    if (this.governance.mode === "strict" && !isRiskExecutionEligible(semanticChangeClass, { profileId: derivedProfileId, riskOverride: request.riskOverride, risk: semanticRisk })) {
      throw new Error("high-risk execution requires guided-engineering profile or an explicit risk override");
    }
    const profile = getProfile(request.profileId || derivedProfileId);
    if (!policy || !profile) throw new Error("unknown execution profile or policy");
    const capabilities = await provider.capabilities();
    for (const capability of policy.requiredCapabilities) if (!capabilities[capability]) throw new Error(`provider ${provider.id} lacks ${capability}`);

    let workspacePath = path.resolve(request.workspacePath || this.projectRoot);
    let projectId = request.projectId || projectIdForPath(workspacePath);
    if (request.missionId) {
      const mission = await this.store.getMission(request.missionId);
      if (!mission) {
        const error = new Error(`MISSION_NOT_FOUND: ${request.missionId}`);
        error.code = "MISSION_NOT_FOUND";
        throw error;
      }
      const missionProject = await this.store.getProject(mission.projectId);
      if (!missionProject?.path) {
        const error = new Error(`MISSION_PROJECT_NOT_FOUND: ${mission.projectId}`);
        error.code = "MISSION_PROJECT_NOT_FOUND";
        throw error;
      }
      const missionWorkspacePath = path.resolve(missionProject.path);
      if (request.projectId && request.projectId !== mission.projectId) {
        const error = new Error("MISSION_SCOPE_MISMATCH: projectId does not match mission.projectId");
        error.code = "MISSION_SCOPE_MISMATCH";
        throw error;
      }
      if (request.workspacePath && path.resolve(request.workspacePath) !== missionWorkspacePath) {
        const error = new Error("MISSION_SCOPE_MISMATCH: workspacePath does not match the Mission project");
        error.code = "MISSION_SCOPE_MISMATCH";
        throw error;
      }
      projectId = mission.projectId;
      workspacePath = missionWorkspacePath;
    }
    const cognitiveBudget = evaluateCognitiveBudget({ ...(request.semanticTask || {}), changeClass: semanticChangeClass, risk: semanticRisk }, this.governance.cognitiveBudget);
    const semanticTaskId = semanticTaskIdOf(request);
    const semanticTask = request.semanticTask || {
      id: semanticTaskId || undefined,
      objective: request.description,
      acceptanceCriteria: [],
      evidenceRequirements: []
    };
    let resolution = createResolution({
      task: semanticTask,
      cognitiveBudget,
      evidenceCandidates: Array.isArray(request.evidenceCandidates) ? request.evidenceCandidates : [],
      mode: request.resolutionMode || request.adaptiveResolutionMode || "shadow",
      executionProfile: profile.id,
      validators: request.validators,
      enforceAuthorized: this.resolutionEnforceAuthorized === true && request.resolutionEnforceAuthorized === true
    });
    resolution = withBudgetReservation(resolution, createBudgetReservation({
      estimate: {
        providerTokens: Number.isFinite(request.estimatedProviderTokens) ? request.estimatedProviderTokens : null,
        maestroContextTokens: resolution.evidence.estimatedSelectedTokens > 0 ? resolution.evidence.estimatedSelectedTokens : null,
        calls: 1,
        retries: 0,
        escalations: 0
      }
    }));
    const reviewPreflight = this.governance.features.independentReview && reviewRequired(cognitiveBudget)
      && (typeof provider.supportsReadOnlyReview !== "function" || !provider.supportsReadOnlyReview())
      ? "reviewer-capability-unavailable" : null;
    const approvalGranted = request.approval?.approved === true || request.approval?.userDecision === "approved" || request.planApproval?.approved === true || request.planApproval?.userDecision === "approved";
    const approvalPreflight = cognitiveBudget.humanApproval && !approvalGranted
      ? "human-approval-required" : null;
    const preflightBlock = reviewPreflight || approvalPreflight;
    const taskId = runtimeTaskId({ missionId: request.missionId, semanticTaskId, semanticTask: request.semanticTask }) || id("task");
    const existingTask = await this.store.getTask(taskId);
    const taskMetadata = {
      ...(existingTask?.metadata || {}),
      ...(request.missionId ? { missionId: request.missionId } : {}),
      ...(semanticTaskId ? { semanticTaskId } : {}),
      ...(request.semanticTask ? { semanticTask: request.semanticTask } : {}),
      ...(request.riskOverride ? { riskOverride: request.riskOverride } : {}),
      cognitiveBudget,
      resolution,
      ...(preflightBlock ? { preflightBlock } : {})
    };
    const task = core.createTask({ id: taskId, description: request.description, projectId, createdAt: existingTask?.createdAt || new Date().toISOString(), metadata: taskMetadata });
    const run = core.createRun({ id: id("run"), taskId: task.id, providerId: provider.id, status: "pending", metadata: taskMetadata });
    const step = core.createStep({ id: id("step"), runId: run.id, profileId: profile.id, status: "pending" });
    const existingProject = await this.store.getProject(projectId);
    if (existingProject?.path && path.resolve(existingProject.path) !== workspacePath) {
      const error = new Error("PROJECT_SCOPE_MISMATCH: projectId is already bound to a different workspacePath");
      error.code = "PROJECT_SCOPE_MISMATCH";
      throw error;
    }
    if (!existingProject) {
      await this.store.createProject({ id: projectId, path: workspacePath, name: path.basename(workspacePath), createdAt: new Date().toISOString() });
    }
    await this.store.saveTask(task); await this.store.saveRun(run); await this.store.saveStep(step);
    await this.record(run.id, "run.created", { taskId: task.id, providerId: provider.id });
    await this.record(run.id, "resolution.planned", {
      mode: resolution.mode,
      strategy: resolution.strategy,
      budgetTier: resolution.budget.tier,
      contextTokens: resolution.budget.contextTokens,
      evidenceCandidates: resolution.evidence.candidates,
      evidenceSelected: resolution.evidence.selected.length,
      contextBudgetOverflow: resolution.evidence.budgetOverflow,
      escalationCount: resolution.escalation.count,
      escalationMax: resolution.escalation.max
    });
    await this.record(run.id, "budget.reserved", {
      reservationId: resolution.budget.reservation.id,
      estimate: resolution.budget.reservation.estimate
    });
    if (preflightBlock) {
      const releasedReservation = releaseBudgetReservation(resolution.budget.reservation, preflightBlock);
      const releasedResolution = withBudgetReservation(resolution, releasedReservation);
      const blockedResolution = finalizeResolution({ contract: releasedResolution, runStatus: "blocked", reason: preflightBlock });
      const blockedTelemetryValue = blockedTelemetry({ budget: cognitiveBudget, projectId, workspacePath, reason: preflightBlock });
      const blockedCognitiveTelemetry = {
        ...blockedTelemetryValue,
        resolution: buildResolutionTelemetry({
          plan: blockedResolution,
          cognitiveTelemetry: blockedTelemetryValue,
          status: "blocked"
        })
      };
      const blockedRun = {
        ...run,
        status: "blocked",
        completedAt: new Date().toISOString(),
        metadata: { ...run.metadata, preflightBlock, resolution: blockedResolution, cognitiveTelemetry: blockedCognitiveTelemetry }
      };
      const blockedStep = { ...step, status: "failed", completedAt: blockedRun.completedAt };
      await this.store.saveRun(blockedRun); await this.store.saveStep(blockedStep);
      await this._recordTaskOutcomeTransition(task.id, run.id, blockedResolution.outcome);
      await this.record(run.id, "budget.released", { reservationId: releasedReservation.id, reason: releasedReservation.reason });
      await this.record(run.id, "run.blocked", { reason: preflightBlock });
      return { task, run: blockedRun, step: blockedStep, profile, policy, provider, capabilities, workspacePath, preflightBlock };
    }
    return { task, run, step, profile, policy, provider, capabilities, workspacePath, preflightBlock: null };
  }

  async executeTaskWithHandoff(request = {}) {
    const providerAttempts = normalizeProviderAttempts(request);
    const maxSwitches = request.maxProviderSwitches === undefined
      ? Math.max(0, providerAttempts.length - 1)
      : request.maxProviderSwitches;
    if (!Number.isInteger(maxSwitches) || maxSwitches < 0 || maxSwitches > 10) {
      throw new TypeError("maxProviderSwitches must be an integer between 0 and 10");
    }

    const attempts = [];
    let checkpoint = request.handoffCheckpoint || null;
    let lastResult = null;
    let lastError = null;

    for (let index = 0; index < providerAttempts.length && index <= maxSwitches; index += 1) {
      const { providerId, model } = providerAttempts[index];
      try {
        const result = await this.executeRun({
          ...request,
          providerId,
          model,
          providerFallbacks: undefined,
          maxProviderSwitches: undefined,
          handoffCheckpoint: checkpoint,
          providerSwitchAttempt: index
        });
        lastResult = result;
        if (checkpoint?.kind === "provider-checkpoint" && !checkpoint.sourceRunId && result?.run?.id) {
          const artifact = core.createArtifact({
            id: id("checkpoint"),
            runId: result.run.id,
            type: "CHECKPOINT",
            name: "provider-handoff-pre-run",
            createdAt: new Date().toISOString(),
            metadata: checkpoint
          });
          await this.store.saveArtifact(artifact);
          await this.record(result.run.id, "provider.handoff", {
            checkpointId: checkpoint.checkpointId,
            fromProvider: checkpoint.providerId,
            toProvider: providerId,
            attempt: checkpoint.attempt,
            preRunFailure: true
          });
        }
        const outcomeState = result?.run?.metadata?.resolution?.outcome?.state;
        if (result?.run?.status === "completed" && (!outcomeState || outcomeState === "validated")) {
          return Object.freeze({
            ...result,
            handoff: Object.freeze({
              switched: attempts.length > 0,
              providerSwitches: attempts.length,
              attempts: Object.freeze([...attempts, Object.freeze({ providerId, model: model || null, runId: result.run.id, status: "validated" })])
            })
          });
        }

        const failureClass = result?.failureClass || classifyResolutionFailure({
          code: result?.failureCode,
          reason: result?.run?.metadata?.resolution?.outcome?.reason,
          failureKind: result?.failureKind
        });
        attempts.push(Object.freeze({ providerId, model: model || null, runId: result?.run?.id || null, status: outcomeState || result?.run?.status || "failed", failureClass }));
        if (failureClass !== "provider-failure" || index >= providerAttempts.length - 1 || index >= maxSwitches) {
          return Object.freeze({ ...result, handoff: Object.freeze({ switched: attempts.length > 1, providerSwitches: Math.max(0, attempts.length - 1), attempts: Object.freeze(attempts) }) });
        }

        const task = result?.run?.taskId ? await this.getTask(result.run.taskId) : null;
        checkpoint = buildProviderCheckpoint({
          task: task || request.semanticTask || {},
          request,
          run: result?.run,
          attempt: index + 1,
          providerId,
          reason: result?.execution?.error || result?.run?.metadata?.resolution?.outcome?.reason || "provider-failure",
          changes: result?.changes,
          evidence: result?.evidence,
          verification: result?.verification,
          review: result?.review,
          remainingBudget: result?.run?.metadata?.resolution?.budget || null
        });
        if (result?.run?.id) {
          const artifact = core.createArtifact({
            id: id("checkpoint"),
            runId: result.run.id,
            type: "CHECKPOINT",
            name: "provider-handoff",
            createdAt: new Date().toISOString(),
            metadata: checkpoint
          });
          await this.store.saveArtifact(artifact);
          await this.record(result.run.id, "provider.handoff", {
            checkpointId: checkpoint.checkpointId,
            fromProvider: providerId,
            toProvider: providerAttempts[index + 1]?.providerId || null,
            attempt: index + 1
          });
        }
      } catch (error) {
        lastError = error;
        const failureClass = classifyResolutionFailure({
          code: error?.code,
          reason: error?.message,
          failureKind: error?.failureKind,
          blockerCodes: error?.blockerCodes
        });
        attempts.push(Object.freeze({ providerId, model: model || null, runId: null, status: "failed", failureClass }));
        if (failureClass !== "provider-failure" || index >= providerAttempts.length - 1 || index >= maxSwitches) throw error;
        checkpoint = buildProviderCheckpoint({
          task: request.semanticTask || {},
          request,
          attempt: index + 1,
          providerId,
          reason: error?.message || "provider-failure",
          remainingBudget: null
        });
      }
    }

    if (lastResult) return Object.freeze({ ...lastResult, handoff: Object.freeze({ switched: attempts.length > 1, providerSwitches: Math.max(0, attempts.length - 1), attempts: Object.freeze(attempts) }) });
    throw lastError || new Error("PROVIDER_HANDOFF_EXHAUSTED");
  }

  async executeRun(request) {
    const prepared = await this.createRun(request);
    const { task, run, step, profile, policy, provider, workspacePath } = prepared;
    if (prepared.preflightBlock) {
      return { run, verification: null, qualityFindings: [], review: { status: "blocked", verdict: "not-requested", calls: 0, reason: prepared.preflightBlock }, execution: null, governanceWarnings: [], governanceBlocking: [prepared.preflightBlock], recommendations: [] };
    }
    const cognitiveBudget = run.metadata?.cognitiveBudget || evaluateCognitiveBudget(request.semanticTask || {}, this.governance.cognitiveBudget);
    const execution = core.createExecution({ id: id("execution"), runId: run.id, stepId: step.id, providerId: provider.id, status: "running", startedAt: new Date().toISOString() });
    await this.store.saveRun({ ...run, status: "running", startedAt: execution.startedAt });
    await this.store.saveStep({ ...step, status: "running", startedAt: execution.startedAt });
    await this.store.saveExecution(execution);
    await this.record(run.id, "run.started", { executionId: execution.id });
    const before = snapshot(workspacePath);
    const engineeringContract = request.engineeringContract
      || buildEngineeringContract({ task: request.semanticTask || task, missionBrief: request.missionBrief });
    const interaction = request.interactionProfile
      ? resolveInteractionProfile({ cwd: workspacePath, cliProfile: request.interactionProfile })
      : this.interaction;
    const requestedSkills = [];
    for (const entry of request.skills || []) {
      const identity = typeof entry === "string" ? entry : entry?.id || entry?.identity;
      if (!identity || requestedSkills.some((item) => item.identity === identity)) continue;
      requestedSkills.push({ identity, role: typeof entry === "object" ? entry.role || "supporting" : "explicit" });
    }
    for (const identity of request.supportingSkills || []) {
      if (typeof identity !== "string" || requestedSkills.some((item) => item.identity === identity)) continue;
      requestedSkills.push({ identity, role: "supporting" });
    }
    const resolvedSkills = requestedSkills.map((item) => ({ ...item, skill: this.skills.get(item.identity) })).filter((item) => item.skill);
    const requiredSkills = resolvedSkills.filter((item) => ["explicit", "primary", "required"].includes(item.role));
    if (requiredSkills.length > cognitiveBudget.maxSkills) {
      const completedAt = new Date().toISOString();
      const reason = `BUDGET_CONFLICT: ${requiredSkills.length} required skills exceed maxSkills=${cognitiveBudget.maxSkills}`;
      const releasedReservation = releaseBudgetReservation(run.metadata.resolution.budget.reservation, "budget-conflict", { completedAt });
      const releasedResolution = withBudgetReservation(run.metadata.resolution, releasedReservation);
      const blockedResolution = finalizeResolution({ contract: releasedResolution, runStatus: "blocked", reason, now: completedAt });
      const blockedTelemetryValue = blockedTelemetry({ budget: cognitiveBudget, projectId, workspacePath, reason, skillsRequested: requestedSkills.length, skillsResolved: resolvedSkills.length });
      const blockedCognitiveTelemetry = {
        ...blockedTelemetryValue,
        resolution: buildResolutionTelemetry({ plan: blockedResolution, cognitiveTelemetry: blockedTelemetryValue, status: "blocked" })
      };
      await this.store.saveExecution({ ...execution, status: "failed", completedAt, metadata: { reason } });
      await this.store.saveStep({ ...step, status: "failed", completedAt });
      await this.store.saveRun({
        ...run,
        status: "blocked",
        completedAt,
        metadata: { ...run.metadata, preflightBlock: "budget-conflict", resolution: blockedResolution, cognitiveTelemetry: blockedCognitiveTelemetry }
      });
      await this._recordTaskOutcomeTransition(task.id, run.id, blockedResolution.outcome);
      await this.record(run.id, "budget.released", { reservationId: releasedReservation.id, reason: releasedReservation.reason });
      await this.record(run.id, "run.blocked", { reason });
      return { run: await this.store.getRun(run.id), verification: null, qualityFindings: [], review: { status: "blocked", verdict: "not-requested", calls: 0, reason: "budget-conflict" }, execution: null, governanceWarnings: [], governanceBlocking: [reason], recommendations: [] };
    }
    const selectedSkills = [...requiredSkills, ...resolvedSkills.filter((item) => !requiredSkills.includes(item))].slice(0, cognitiveBudget.maxSkills);
    const executionPackage = Object.freeze({
      task, run, step, profile, policy,
      workspace: { path: workspacePath },
      permissions: request.permissions || {},
      skills: selectedSkills.map((item) => item.skill),
      previousArtifacts: request.previousArtifacts || [],
      handoffCheckpoint: request.handoffCheckpoint || null,
      engineeringContract,
      interaction,
      includeGovernanceContext: this.governance.mode === "strict" || request.includeGovernanceContext === true
    });
    const promptEnvelope = this.buildPromptEnvelope(executionPackage);
    let handle;
    let result;
    try {
      handle = await provider.execute({ prompt: promptEnvelope.prompt, workspacePath, model: request.model, sandbox: request.sandbox, permissionMode: request.permissionMode, mode: request.mode, agent: request.agent, sessionId: request.sessionId, continue: request.continue, timeoutMs: policy.timeoutMs, onEvent: (event) => this.record(run.id, event.type, event) });
      this.activeRuns.set(run.id, handle);
      result = await handle.result;
    } catch (error) {
      this.activeRuns.delete(run.id);
      const completedAt = new Date().toISOString();
      // Durable rejection reason is sanitized: provider/transport errors
      // routinely embed tokens, cookies, connection strings and home paths.
      const cleanReason = sanitizeDiagnostic(error && error.message ? error.message : String(error));
      // A provider may mutate the workspace and then crash before returning a
      // normal result. Capture that partial ChangeSet so the provider handoff
      // reflects the real workspace state instead of pretending no work happened.
      const failedChanges = diff(workspacePath);
      const failedArtifact = core.createArtifact({
        id: id("artifact"),
        runId: run.id,
        stepId: step.id,
        type: "DIFF",
        name: "git-diff-provider-failure",
        createdAt: completedAt,
        metadata: durableChangeArtifactMetadata(before, failedChanges)
      });
      await this.store.saveArtifact(failedArtifact);
      await this.record(run.id, "artifact.created", { artifactId: failedArtifact.id, type: failedArtifact.type });
      await this.store.saveExecution({ ...execution, status: "failed", completedAt, metadata: { error: cleanReason, engineeringContract: executionPackage.engineeringContract } });
      await this.store.saveStep({ ...step, status: "failed", completedAt });
      // Failed-run telemetry: minimal but coherent. The provider call was
      // attempted (execute and/or result rejected), so primaryCalls is 1;
      // tokens are null (never invented), source unavailable, scope unknown.
      const failedIdentity = gitIdentityForTelemetry(workspacePath);
      const failedStartedMs = Date.parse(execution.startedAt) || null;
      const failedCompletedMs = Date.parse(completedAt) || null;
      const failedTelemetry = buildCognitiveTelemetry({
        budget: cognitiveBudget,
        primaryUsage: {
          tool: provider.id,
          provider: "unknown",
          model: request.model && request.model !== "default" ? request.model : "unknown",
          tokenInput: null, tokenOutput: null, cachedInputTokens: null,
          tokenSource: "unavailable", usageScope: "unknown", modelCalls: 0
        },
        reviewCalls: 0,
        skillsRequested: requestedSkills.length,
        skillsResolved: resolvedSkills.length,
        skillsLoaded: executionPackage.skills.length,
        outcome: "failed",
        reason: cleanReason,
        runId: run.id,
        taskId: task.id,
        executionId: execution.id,
        projectId: task.projectId || null,
        repositoryId: failedIdentity.repositoryId,
        branch: failedIdentity.branch,
        headCommit: failedIdentity.headCommit,
        startedAt: execution.startedAt,
        completedAt,
        durationMs: failedStartedMs !== null && failedCompletedMs !== null ? Math.max(0, failedCompletedMs - failedStartedMs) : null,
        status: "failed",
        childAgents: [],
        automaticRetries: Number.isInteger(request.automaticRetries) ? request.automaticRetries : 0,
        escalations: run.metadata?.resolution?.escalation?.count ?? 0,
        providerSwitches: Number.isInteger(request.providerSwitchAttempt) ? request.providerSwitchAttempt : 0,
        prompt: promptEnvelope.prompt,
        contextDigests: {
          maestroPrompt: promptEnvelope.manifest.promptHash,
          maestroPromptManifest: promptEnvelope.manifest.manifestHash
        }
      });
      const committedReservation = commitBudgetReservation(run.metadata.resolution.budget.reservation, {
        providerTokens: null,
        calls: 1,
        agentsObserved: null,
        retries: 0,
        escalations: 0,
        durationMs: failedStartedMs !== null && failedCompletedMs !== null ? Math.max(0, failedCompletedMs - failedStartedMs) : null
      }, { completedAt });
      const failedResolution = finalizeResolution({
        contract: withBudgetReservation(run.metadata.resolution, committedReservation),
        runStatus: "failed",
        reason: cleanReason
      });
      const failedCognitiveTelemetry = {
        ...failedTelemetry,
        resolution: buildResolutionTelemetry({
          plan: failedResolution,
          cognitiveTelemetry: failedTelemetry,
          promptManifest: promptEnvelope.manifest,
          status: "failed"
        })
      };
      await this.store.saveRun({
        ...run,
        status: "failed",
        completedAt,
        metadata: { ...run.metadata, resolution: failedResolution, cognitiveTelemetry: failedCognitiveTelemetry }
      });
      await this._recordTaskOutcomeTransition(task.id, run.id, failedResolution.outcome);
      await this.record(run.id, "budget.committed", { reservationId: committedReservation.id, actual: committedReservation.actual });
      await this.record(run.id, "run.failed", { reason: cleanReason });
      return { run: await this.store.getRun(run.id), execution: { exitCode: 1, error: cleanReason }, changes: failedChanges, verification: null, review: { status: "disabled", verdict: "not-requested", calls: 0 }, failureClass: "provider-failure", failureKind: "provider", failureCode: "PROVIDER_EXECUTION_FAILED", governanceWarnings: [], governanceBlocking: [], recommendations: [] };
    }
    this.activeRuns.delete(run.id);
    const executionStatus = result.cancelled ? "cancelled" : result.timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed";
    // Durable execution record carries a sanitized summary only. Full result
    // (args with prompt, stdout/stderr) stays ephemeral in memory for parsers.
    let primaryUsageSummary = null;
    try {
      const parsed = parseProviderUsage({ providerId: provider.id, stdout: result?.stdout, stderr: result?.stderr, model: request.model });
      primaryUsageSummary = { tool: parsed.tool, provider: parsed.provider, model: parsed.model, sessionId: parsed.sessionId, tokenInput: parsed.tokenInput, tokenOutput: parsed.tokenOutput, cachedInputTokens: parsed.cachedInputTokens, tokenSource: parsed.tokenSource, usageComplete: parsed.usageComplete === true };
    } catch { primaryUsageSummary = null; }
    await this.store.saveExecution({ ...execution, status: executionStatus, completedAt: new Date().toISOString(), metadata: { summary: durableExecutionSummary(result, { providerId: provider.id }), engineeringContract: executionPackage.engineeringContract, usage: primaryUsageSummary } });
    const changes = diff(workspacePath);
    const artifact = core.createArtifact({ id: id("artifact"), runId: run.id, stepId: step.id, type: "DIFF", name: "git-diff", createdAt: new Date().toISOString(), metadata: durableChangeArtifactMetadata(before, changes) });
    await this.store.saveArtifact(artifact); await this.record(run.id, "artifact.created", { artifactId: artifact.id, type: artifact.type });
    const commands = request.verificationCommands || this.inferProjectVerification(workspacePath);
    const verification = await this.verification.verify({ id: id("verification"), runId: run.id, commands, cwd: workspacePath, timeoutMs: policy.timeoutMs });
    await this.store.saveVerification(verification);
    const verificationEventType = verification.status === "passed"
      ? "verification.completed"
      : verification.status === "skipped"
        ? "verification.skipped"
        : "verification.failed";
    await this.record(run.id, verificationEventType, { verificationId: verification.id, status: verification.status });
    const qualityReview = request.qualityReview === true || profile.id === "guided-engineering";
    const allSourceFiles = listSourceFiles(workspacePath);
    const gitChangedFiles = changes.available ? changes.changedFiles : [];
    const filesToReview = gitChangedFiles.length > 0
      ? [...new Set([...gitChangedFiles, ...allSourceFiles])]
      : allSourceFiles;
    const qualityFindings = qualityReview
      ? filesToReview.map((filePath) => {
        const fullPath = path.join(workspacePath, filePath);
        if (!fs.existsSync(fullPath)) return [];
        return detectQualityFindings({ filePath, source: fs.readFileSync(fullPath, "utf8") });
      }).flat()
      : [];
    const evidenceEntries = (value) => Array.isArray(value) ? value : value ? [value] : [];
    const producedEvidence = [...evidenceEntries(request.evidence), ...evidenceEntries(result.evidence)];
    let review = Object.freeze({ status: "disabled", verdict: "not-requested", calls: 0 });
    if (this.governance.features.independentReview && reviewRequired(cognitiveBudget) && executionStatus === "completed" && verification.status !== "failed") {
      review = await this._runIndependentReview({ request, task, run, step, provider, workspacePath, cognitiveBudget, changes, verification, evidence: producedEvidence });
    }
    const persistedEvidence = await this._persistProducedEvidence({
      evidence: producedEvidence,
      taskId: task.id,
      runId: run.id,
      verificationId: verification.id
    });
    const completionTask = request.semanticTask
      ? { ...request.semanticTask, id: task.id }
      : { id: task.id, acceptanceCriteria: [] };
    const completion = isTaskCompletionEligible(completionTask, { evidence: persistedEvidence, verification, qualityFindings, deterministic: true });
    const governance = buildGovernance({ config: this.governance, task: completionTask, verification, evidence: persistedEvidence, sessionWarnings: this.governanceWarnings });
    this.governanceNotices = [...governance.warnings, ...governance.recommendations];
    const strictGate = governance.mode === "strict";
    const hasCriticalFinding = qualityFindings.some((finding) => finding?.blocking || ["BLOCKER", "HIGH"].includes(String(finding?.severity || "").toUpperCase()));
    const reviewBlocking = review.status === "rejected" || review.status === "inconclusive" || review.status === "unavailable";
    const status = executionStatus === "completed" && !reviewBlocking && !hasCriticalFinding && governance.blocking.length === 0 && (!strictGate || (verification.status === "passed" && completion.eligible)) ? "completed" : executionStatus === "cancelled" ? "cancelled" : executionStatus === "timed_out" ? "timed_out" : "failed";
    const completedAt = new Date().toISOString();
    const finalizedResolution = finalizeResolution({
      contract: run.metadata.resolution,
      runStatus: status,
      verification,
      completion,
      review,
      reason: governance.blocking[0] || (hasCriticalFinding ? "quality-finding" : reviewBlocking ? "review-blocking" : null),
      now: completedAt
    });
    await this.store.saveStep({ ...step, status: status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed", completedAt });
    await this.store.saveRun({
      ...run,
      status,
      startedAt: execution.startedAt,
      completedAt,
      metadata: { ...run.metadata, resolution: finalizedResolution }
    });
    await this.record(run.id, status === "completed" ? "run.completed" : "run.failed", { status, resolutionState: finalizedResolution.outcome.state });
    await this._recordTaskOutcomeTransition(task.id, run.id, finalizedResolution.outcome);
    const finalRun = await this.store.getRun(run.id);
    if (finalRun) {
      // Economic telemetry: provider-reported when the CLI exposes usage,
      // otherwise explicit unavailable (never 0-as-unknown). Extends the
      // existing cognitiveTelemetry object; no parallel store.
      let primaryUsage = null;
      let childAgents = [];
      try {
        primaryUsage = parseProviderUsage({ providerId: provider.id, stdout: result?.stdout, stderr: result?.stderr, model: request.model });
      } catch { primaryUsage = null; }
      try {
        childAgents = [...extractChildAgents({ providerId: provider.id, stdout: result?.stdout })];
      } catch { childAgents = []; }
      let reviewUsage = null;
      try {
        if (review && review.usage) reviewUsage = review.usage;
      } catch { reviewUsage = null; }
      try {
        const reviewAgents = Array.isArray(review?.childAgents) ? review.childAgents : [];
        if (reviewAgents.length > 0) childAgents = [...childAgents, ...reviewAgents];
      } catch { /* keep primary agents only */ }
      const identity = gitIdentityForTelemetry(workspacePath);
      const startedMs = Date.parse(execution.startedAt) || null;
      const completedMs = Date.parse(completedAt) || null;
      const telemetry = buildCognitiveTelemetry({
        budget: cognitiveBudget,
        primaryUsage,
        reviewUsage,
        reviewCalls: Number.isInteger(review?.calls) ? review.calls : null,
        skillsRequested: requestedSkills.length,
        skillsResolved: resolvedSkills.length,
        skillsLoaded: executionPackage.skills.length,
        outcome: status,
        runId: run.id,
        taskId: task.id,
        executionId: execution.id,
        reviewExecutionId: review?.executionId || null,
        projectId: task.projectId || null,
        repositoryId: identity.repositoryId,
        branch: identity.branch,
        headCommit: identity.headCommit,
        startedAt: execution.startedAt,
        completedAt,
        durationMs: startedMs !== null && completedMs !== null ? Math.max(0, completedMs - startedMs) : null,
        status,
        childAgents,
        automaticRetries: Number.isInteger(request.automaticRetries) ? request.automaticRetries : 0,
        escalations: finalRun.metadata?.resolution?.escalation?.count ?? 0,
        providerSwitches: Number.isInteger(request.providerSwitchAttempt) ? request.providerSwitchAttempt : 0,
        prompt: promptEnvelope.prompt,
        contextDigests: {
          maestroPrompt: promptEnvelope.manifest.promptHash,
          maestroPromptManifest: promptEnvelope.manifest.manifestHash
        }
      });
      const providerTokens = telemetry.usageComplete === true
        && ["provider-reported", "derived"].includes(telemetry.tokenSource)
        && Number.isFinite(telemetry.tokenInput) && Number.isFinite(telemetry.tokenOutput)
        ? telemetry.tokenInput + telemetry.tokenOutput : null;
      const committedReservation = commitBudgetReservation(finalRun.metadata.resolution.budget.reservation, {
        providerTokens,
        maestroContextTokens: finalRun.metadata.resolution.evidence.estimatedSelectedTokens > 0
          ? finalRun.metadata.resolution.evidence.estimatedSelectedTokens : null,
        calls: Number.isInteger(telemetry.primaryCalls) && Number.isInteger(telemetry.reviewCalls)
          ? telemetry.primaryCalls + telemetry.reviewCalls : null,
        agentsObserved: Number.isInteger(telemetry.childAgentsObserved) ? telemetry.childAgentsObserved + 1 : null,
        retries: Number.isInteger(telemetry.automaticRetries) ? telemetry.automaticRetries : null,
        escalations: finalRun.metadata.resolution.escalation?.count ?? 0,
        durationMs: telemetry.durationMs
      }, { completedAt });
      const committedResolution = withBudgetReservation(finalRun.metadata.resolution, committedReservation);
      const cognitiveTelemetry = {
        ...telemetry,
        resolution: buildResolutionTelemetry({
          plan: committedResolution,
          cognitiveTelemetry: telemetry,
          verification,
          completion,
          review,
          promptManifest: promptEnvelope.manifest,
          status
        })
      };
      await this.store.saveRun({
        ...finalRun,
        metadata: { ...(finalRun.metadata || {}), resolution: committedResolution, cognitiveTelemetry }
      });
      await this.record(run.id, "budget.committed", { reservationId: committedReservation.id, actual: committedReservation.actual });
    }
    const failureClass = status === "completed" ? null
      : executionStatus !== "completed" ? "provider-failure"
        : governance.blocking.length > 0 ? "policy-block"
          : "validation-failure";
    return { run: await this.store.getRun(run.id), verification, evidence: persistedEvidence, qualityFindings, review, engineeringContract: executionPackage.engineeringContract, changes, execution: result, failureClass, governanceWarnings: governance.warnings, governanceBlocking: governance.blocking, recommendations: governance.recommendations };
  }

  async _recordTaskOutcomeTransition(taskId, runId, outcome) {
    if (!outcome?.state) return null;
    const history = await this.getTaskOutcomeHistory(taskId);
    const previous = [...history].reverse().find((entry) => entry.runId !== runId) || null;
    const hadValidated = history.some((entry) => entry.runId !== runId && entry.outcome?.state === "validated");
    let type = null;
    if (outcome.state === "validated" && previous?.outcome?.state !== "validated") {
      type = hadValidated ? "outcome.revalidated" : "outcome.validated";
    } else if (previous?.outcome?.state === "validated" && outcome.state !== "validated") {
      type = "outcome.revoked";
    }
    if (!type) return null;
    await this.record(runId, type, {
      taskId,
      previousState: previous?.outcome?.state || null,
      state: outcome.state,
      previousRunId: previous?.runId || null
    });
    return type;
  }

  async _persistProducedEvidence({ evidence, taskId, runId, verificationId }) {
    const entries = Array.isArray(evidence) ? evidence : evidence ? [evidence] : [];
    const persisted = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const acceptanceCriterion = criterionText(entry.acceptanceCriterion ?? entry.criterion ?? entry.acceptanceCriterionId);
      const confidence = Number.isInteger(entry.confidence) && entry.confidence >= 0 && entry.confidence <= 100
        ? entry.confidence : undefined;
      let artifactId;
      if (typeof entry.artifactId === "string" && entry.artifactId.trim()) {
        const candidateArtifact = await this.store.getArtifact(entry.artifactId.trim());
        if (candidateArtifact?.runId === runId) artifactId = candidateArtifact.id;
      }
      const record = core.createEvidence({
        id: id("evidence"),
        taskId,
        runId,
        artifactId,
        type: evidenceLabel(entry.type, "runtime-evidence"),
        content: evidenceText(entry.content ?? entry.value ?? entry.summary ?? entry.type),
        acceptanceCriterion,
        acceptanceCriterionId: criterionText(entry.acceptanceCriterionId),
        producer: evidenceLabel(entry.producer, "runtime"),
        verificationId,
        createdAt: new Date().toISOString(),
        metadata: entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
          ? sanitizeEvidenceMetadata(entry.metadata) : undefined,
        confidence
      });
      await this.store.saveEvidence(record);
      await this.record(runId, "evidence.created", {
        evidenceId: record.id,
        taskId,
        type: record.type,
        acceptanceCriterion: record.acceptanceCriterion || null,
        verificationId: record.verificationId || null
      });
      persisted.push(record);
    }
    return Object.freeze(persisted);
  }

  async _runIndependentReview({ request, task, run, step, provider, workspacePath, cognitiveBudget, changes, verification, evidence }) {
    if (typeof provider.supportsReadOnlyReview !== "function" || !provider.supportsReadOnlyReview()) {
      return Object.freeze({ status: "unavailable", verdict: "inconclusive", calls: 0, reason: "provider-read-only-review-unavailable" });
    }
    // The joined `patch` duplicates workingTreePatch + stagedPatch + the
    // synthetic untracked patches (~2x bytes against the reviewer budget),
    // so the reviewer context carries only the granular fields.
    const reviewDiff = JSON.stringify({
      changedFiles: changes?.changedFiles || [],
      stats: changes?.stats || [],
      stagedStats: changes?.stagedStats || [],
      workingTreePatch: changes?.workingTreePatch || "",
      stagedPatch: changes?.stagedPatch || "",
      untrackedFiles: changes?.untrackedFiles || [],
      untrackedContent: changes?.untrackedContent || [],
      binaryFiles: changes?.binaryFiles || [],
      sensitiveFiles: changes?.sensitiveFiles || [],
      omitted: changes?.omitted || [],
      limits: changes?.limits || {},
      truncated: changes?.truncated === true,
      truncationNotice: changes?.truncated === true ? "ChangeSet context was truncated; omitted content is represented by metadata only." : null
    });
    // The JSON wrapper above is never an empty string, so detect an empty
    // ChangeSet explicitly instead of spending a reviewer call on nothing.
    const hasReviewContent = (changes?.changedFiles || []).length > 0
      || (changes?.untrackedFiles || []).length > 0
      || Boolean((changes?.workingTreePatch || "").trim())
      || Boolean((changes?.stagedPatch || "").trim())
      || (changes?.untrackedContent || []).length > 0
      || Boolean((changes?.patch || "").trim());
    if (!hasReviewContent) {
      return Object.freeze({ status: "inconclusive", verdict: "inconclusive", findings: [{ code: "REVIEW_NOTHING_TO_REVIEW" }], summary: "No working-tree changes were observed for this review.", calls: 0, contextTruncated: false });
    }
    const prompt = buildReviewPrompt({ task: request.semanticTask || task, diff: reviewDiff, verification, evidence, constraints: request.constraints || [], omitted: changes?.omitted || [], maxTokens: cognitiveBudget.contextTokens });
    if (!changes?.available || !changes.patchComplete || !prompt.diffIncluded || prompt.truncated) {
      return Object.freeze({ status: "inconclusive", verdict: "inconclusive", findings: [{ code: "REVIEW_CONTEXT_INCOMPLETE" }], summary: "The reviewer did not receive a complete patch and context.", calls: 0, contextTruncated: prompt.truncated });
    }
    const execution = core.createExecution({ id: id("review-execution"), runId: run.id, stepId: step.id, providerId: provider.id, status: "running", startedAt: new Date().toISOString(), metadata: { role: "independent-reviewer", sourceRunId: run.id, contextTruncated: prompt.truncated, reviewBudget: prompt.budget } });
    await this.store.saveExecution(execution); await this.record(run.id, "review.started", { executionId: execution.id });
    try {
      const handle = await provider.execute({ prompt: prompt.prompt, workspacePath, model: request.reviewerModel || request.model, sandbox: "read-only", sessionId: `review-${crypto.randomUUID()}`, freshSession: true, timeoutMs: getPolicy(request.policyId || "standard")?.timeoutMs, onEvent: (event) => this.record(run.id, event.type, event) });
      const raw = await handle.result;
      // Reviewer process output is untrusted for persistence: a failed
      // reviewer stderr (or a model summary echoing workspace content) is
      // sanitized before becoming a durable summary/artifact.
      const parsed = raw.exitCode === 0 ? parseReviewResult(raw.stdout) : { verdict: "inconclusive", findings: [{ code: "REVIEW_PROCESS_FAILED" }], summary: sanitizeDiagnostic(raw.stderr || "reviewer process failed") };
      const status = parsed.verdict === "approved" ? "approved" : parsed.verdict === "rejected" ? "rejected" : "inconclusive";
      const durableReviewFindings = sanitizeEvidenceMetadata(parsed.findings || []);
      const durableReviewSummary = sanitizeDiagnostic(parsed.summary || "", { maxChars: 4000 });
      // Reviewer usage is provider-reported when the CLI exposes it; never
      // invented. Child agents observed on the review call are carried for
      // the run-level topology.
      let reviewUsage = null;
      let reviewAgents = [];
      try {
        reviewUsage = parseProviderUsage({ providerId: provider.id, stdout: raw.stdout, stderr: raw.stderr, model: request.reviewerModel || request.model });
      } catch { reviewUsage = null; }
      try {
        reviewAgents = [...extractChildAgents({ providerId: provider.id, stdout: raw.stdout })];
      } catch { reviewAgents = []; }
      await this.store.saveExecution({ ...execution, status: status === "approved" ? "completed" : "failed", completedAt: new Date().toISOString(), metadata: { role: "independent-reviewer", verdict: parsed.verdict, findings: durableReviewFindings, usage: reviewUsage ? { tool: reviewUsage.tool, provider: reviewUsage.provider, model: reviewUsage.model, sessionId: reviewUsage.sessionId, tokenInput: reviewUsage.tokenInput, tokenOutput: reviewUsage.tokenOutput, cachedInputTokens: reviewUsage.cachedInputTokens, tokenSource: reviewUsage.tokenSource } : null } });
      await this.store.saveArtifact(core.createArtifact({ id: id("review-artifact"), runId: run.id, stepId: step.id, type: "REVIEW", name: "independent-review", createdAt: new Date().toISOString(), metadata: { verdict: parsed.verdict, findings: durableReviewFindings, summary: durableReviewSummary, executionId: execution.id, contextTruncated: prompt.truncated } }));
      await this.record(run.id, status === "approved" ? "review.completed" : "review.failed", { executionId: execution.id, verdict: parsed.verdict });
      return Object.freeze({ status, verdict: parsed.verdict, findings: parsed.findings, summary: parsed.summary, calls: 1, contextTruncated: prompt.truncated, executionId: execution.id, usage: reviewUsage, childAgents: reviewAgents });
    } catch (error) {
      const cleanReviewReason = sanitizeDiagnostic(error && error.message ? error.message : String(error));
      await this.store.saveExecution({ ...execution, status: "failed", completedAt: new Date().toISOString(), metadata: { role: "independent-reviewer", error: cleanReviewReason } });
      await this.record(run.id, "review.failed", { executionId: execution.id, reason: cleanReviewReason });
      return Object.freeze({ status: "inconclusive", verdict: "inconclusive", calls: 1, reason: cleanReviewReason });
    }
  }

  async cancelRun(runId) {
    const handle = this.activeRuns.get(runId);
    if (!handle) return false;
    handle.cancel(); await this.record(runId, "run.cancel_requested", {}); return true;
  }

  async startIntentSession({ workspacePath, rawIntent }) {
    await this.initialize();
    const resolvedPath = path.resolve(workspacePath || this.projectRoot);
    const projectId = projectIdForPath(resolvedPath);
    await this.store.createProject({ id: projectId, path: resolvedPath, name: path.basename(resolvedPath), createdAt: new Date().toISOString() });
    const session = core.createIntentSession({ id: id("session"), projectId, rawIntent, readinessScore: 0 });
    await this.store.saveIntentSession(session);
    return session;
  }

  async updateIntentSession(sessionId, updates) {
    const session = await this.store.getIntentSession(sessionId);
    if (!session) throw new Error(`Sessão de intenção não encontrada: ${sessionId}`);
    const nextSession = core.createIntentSession({ ...session, ...updates });
    await this.store.saveIntentSession(nextSession);
    return nextSession;
  }

  async approveMissionBrief(sessionId, briefInput) {
    const session = await this.store.getIntentSession(sessionId);
    if (!session) throw new Error(`Sessão de intenção não encontrada: ${sessionId}`);

    if (session.readinessScore < 100) {
      await this.updateIntentSession(sessionId, { readinessScore: 100 });
    }

    const brief = core.createMissionBrief({
      id: id("brief"),
      intentSessionId: sessionId,
      objective: briefInput.objective,
      requirements: briefInput.requirements || [],
      userDecisions: briefInput.userDecisions || [],
      constraints: briefInput.constraints || [],
      relevantContext: briefInput.relevantContext ? briefInput.relevantContext : undefined
    });

    await this.store.saveMissionBrief(brief);
    return brief;
  }

  buildPromptEnvelope(executionPackage) {
    const taskContext = compactContext(executionPackage.task, {
      files: [],
      skills: executionPackage.skills
    });
    const skillPaths = taskContext.skills.map((skill) => `- ${skill.identity}: ${skill.path}`).join("\n");
    const sections = [
      { id: "profile", kind: "profile", content: executionPackage.profile.instructions || `Act as ${executionPackage.profile.displayName}.`, text: executionPackage.profile.instructions || `Act as ${executionPackage.profile.displayName}.` },
      { id: "interaction", kind: "interaction", content: interactionContract(executionPackage.interaction), text: interactionContract(executionPackage.interaction) },
      { id: "task", kind: "task", content: taskContext.description, text: `Task: ${taskContext.description}` },
      { id: "workspace", kind: "workspace", content: executionPackage.workspace.path, text: `Workspace: ${executionPackage.workspace.path}` },
      { id: "engineering-contract", kind: "governance", content: executionPackage.includeGovernanceContext ? JSON.stringify(executionPackage.engineeringContract) : "", text: executionPackage.includeGovernanceContext ? `Engineering contract: ${JSON.stringify(executionPackage.engineeringContract)}` : "" },
      { id: "skills", kind: "skills", content: skillPaths, text: skillPaths ? `Resolved skills:\n${skillPaths}` : "" },
      { id: "handoff-checkpoint", kind: "continuation", content: executionPackage.handoffCheckpoint ? JSON.stringify(executionPackage.handoffCheckpoint) : "", text: checkpointPrompt(executionPackage.handoffCheckpoint) },
      { id: "execution-boundary", kind: "instruction", content: "Work only within the workspace and report concrete changes.", text: "Work only within the workspace and report concrete changes." }
    ].filter((section) => Boolean(section.text));
    const prompt = sections.map((section) => section.text).join("\n\n");
    return Object.freeze({ prompt, manifest: buildMaestroPromptManifest(sections) });
  }

  buildPrompt(executionPackage) {
    return this.buildPromptEnvelope(executionPackage).prompt;
  }

  inferProjectVerification(workspacePath) {
    const packagePath = path.join(workspacePath, "package.json");
    if (!fs.existsSync(packagePath)) return [];
    try { return inferCommands(JSON.parse(fs.readFileSync(packagePath, "utf8"))); } catch { return []; }
  }

  async record(runId, type, data) {
    const event = { id: id("event"), runId: runId || undefined, type, occurredAt: new Date().toISOString(), data };
    // Ephemeral stream: live subscribers still receive chunks for UI, but
    // nothing hits the RunStore file (no per-chunk rewrite, no raw output).
    if (EPHEMERAL_EVENT_TYPES.has(type)) {
      this.events.emit("event", event);
      return event;
    }
    await this.store.appendEvent(event); this.events.emit("event", event); return event;
  }

  publishEphemeral(runId, type, data) {
    const event = { id: id("event"), runId: runId || undefined, type, occurredAt: new Date().toISOString(), data };
    this.events.emit("event", event);
    return event;
  }
}

module.exports = { MaestroApplication, ProviderRegistry, projectIdForPath, normalizeProviderAttempts };
