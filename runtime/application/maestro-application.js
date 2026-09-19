"use strict";

const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core");
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
const EPHEMERAL_EVENT_TYPES = new Set(["provider.started", "provider.output", "provider.completed", "run.output"]);

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
    const status = latestRun?.status === "running" ? "running"
      : latestRun?.status === "failed" && verification?.status === "failed" ? "verification_failed"
        : latestRun?.status === "failed" ? "needs_attention"
          : git.available && git.files.length > 0 ? "changes_detected"
            : latestRun?.status === "completed" ? "healthy" : "idle";
    return {
      id: idToUse, path: workspacePath, name: stored?.name || path.basename(workspacePath), known: Boolean(stored),
      status, latestRun, verification, git, runCount: runs.length
    };
  }
  async inspectRun(runId) {
    const run = await this.getRun(runId); if (!run) return null;
    const task = await this.getTask(run.taskId);
    return { run, task, project: task?.projectId ? await this.getProject(task.projectId) : null,
      steps: await this.store.listSteps({ runId }), executions: await this.store.listExecutions({ runId }),
      artifacts: await this.listArtifacts({ runId }), verification: await this.getVerification(runId),
      events: await this.store.listEvents({ runId }) };
  }
  async listArtifacts(filters) { return this.store.listArtifacts(filters); }
  async getArtifact(artifactId) { return this.store.getArtifact(artifactId); }
  async getVerification(runId) { return (await this.store.listVerifications({ runId }))[0]; }
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

    const workspacePath = path.resolve(request.workspacePath || this.projectRoot);
    const projectId = request.projectId || projectIdForPath(workspacePath);
    const cognitiveBudget = evaluateCognitiveBudget({ ...(request.semanticTask || {}), changeClass: semanticChangeClass, risk: semanticRisk }, this.governance.cognitiveBudget);
    const reviewPreflight = this.governance.features.independentReview && reviewRequired(cognitiveBudget)
      && (typeof provider.supportsReadOnlyReview !== "function" || !provider.supportsReadOnlyReview())
      ? "reviewer-capability-unavailable" : null;
    const approvalGranted = request.approval?.approved === true || request.approval?.userDecision === "approved" || request.planApproval?.approved === true || request.planApproval?.userDecision === "approved";
    const approvalPreflight = cognitiveBudget.humanApproval && !approvalGranted
      ? "human-approval-required" : null;
    const preflightBlock = reviewPreflight || approvalPreflight;
    const taskMetadata = {
      ...(request.missionId ? { missionId: request.missionId } : {}),
      ...(request.semanticTaskId ? { semanticTaskId: request.semanticTaskId } : {}),
      ...(request.semanticTask ? { semanticTask: request.semanticTask } : {}),
      ...(request.riskOverride ? { riskOverride: request.riskOverride } : {}),
      cognitiveBudget,
      ...(preflightBlock ? { preflightBlock } : {})
    };
    const task = core.createTask({ id: id("task"), description: request.description, projectId, createdAt: new Date().toISOString(), metadata: taskMetadata });
    const run = core.createRun({ id: id("run"), taskId: task.id, providerId: provider.id, status: "pending", metadata: taskMetadata });
    const step = core.createStep({ id: id("step"), runId: run.id, profileId: profile.id, status: "pending" });
    await this.store.createProject({ id: projectId, path: workspacePath, name: path.basename(workspacePath), createdAt: new Date().toISOString() });
    await this.store.saveTask(task); await this.store.saveRun(run); await this.store.saveStep(step);
    await this.record(run.id, "run.created", { taskId: task.id, providerId: provider.id });
    if (preflightBlock) {
      const blockedTelemetryValue = blockedTelemetry({ budget: cognitiveBudget, projectId, workspacePath, reason: preflightBlock });
      const blockedRun = { ...run, status: "blocked", completedAt: new Date().toISOString(), metadata: { ...run.metadata, preflightBlock, cognitiveTelemetry: blockedTelemetryValue } };
      const blockedStep = { ...step, status: "failed", completedAt: blockedRun.completedAt };
      await this.store.saveRun(blockedRun); await this.store.saveStep(blockedStep);
      await this.record(run.id, "run.blocked", { reason: preflightBlock });
      return { task, run: blockedRun, step: blockedStep, profile, policy, provider, capabilities, workspacePath, preflightBlock };
    }
    return { task, run, step, profile, policy, provider, capabilities, workspacePath, preflightBlock: null };
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
      await this.store.saveExecution({ ...execution, status: "failed", completedAt, metadata: { reason } });
      await this.store.saveStep({ ...step, status: "failed", completedAt });
      await this.store.saveRun({ ...run, status: "blocked", completedAt, metadata: { ...run.metadata, preflightBlock: "budget-conflict", cognitiveTelemetry: blockedTelemetry({ budget: cognitiveBudget, projectId, workspacePath, reason, skillsRequested: requestedSkills.length, skillsResolved: resolvedSkills.length }) } });
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
      engineeringContract,
      interaction,
      includeGovernanceContext: this.governance.mode === "strict" || request.includeGovernanceContext === true
    });
    let handle;
    let result;
    try {
      handle = await provider.execute({ prompt: this.buildPrompt(executionPackage), workspacePath, model: request.model, sandbox: request.sandbox, permissionMode: request.permissionMode, mode: request.mode, agent: request.agent, sessionId: request.sessionId, continue: request.continue, timeoutMs: policy.timeoutMs, onEvent: (event) => this.record(run.id, event.type, event) });
      this.activeRuns.set(run.id, handle);
      result = await handle.result;
    } catch (error) {
      this.activeRuns.delete(run.id);
      const completedAt = new Date().toISOString();
      // Durable rejection reason is sanitized: provider/transport errors
      // routinely embed tokens, cookies, connection strings and home paths.
      const cleanReason = sanitizeDiagnostic(error && error.message ? error.message : String(error));
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
        childAgents: []
      });
      await this.store.saveRun({ ...run, status: "failed", completedAt, metadata: { ...run.metadata, cognitiveTelemetry: failedTelemetry } });
      await this.record(run.id, "run.failed", { reason: cleanReason });
      return { run: await this.store.getRun(run.id), execution: { exitCode: 1, error: cleanReason }, verification: null, review: { status: "disabled", verdict: "not-requested", calls: 0 }, governanceWarnings: [], governanceBlocking: [], recommendations: [] };
    }
    this.activeRuns.delete(run.id);
    const executionStatus = result.cancelled ? "cancelled" : result.timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed";
    // Durable execution record carries a sanitized summary only. Full result
    // (args with prompt, stdout/stderr) stays ephemeral in memory for parsers.
    let primaryUsageSummary = null;
    try {
      const parsed = parseProviderUsage({ providerId: provider.id, stdout: result?.stdout, stderr: result?.stderr, model: request.model });
      primaryUsageSummary = { tool: parsed.tool, provider: parsed.provider, model: parsed.model, sessionId: parsed.sessionId, tokenInput: parsed.tokenInput, tokenOutput: parsed.tokenOutput, cachedInputTokens: parsed.cachedInputTokens, tokenSource: parsed.tokenSource };
    } catch { primaryUsageSummary = null; }
    await this.store.saveExecution({ ...execution, status: executionStatus, completedAt: new Date().toISOString(), metadata: { summary: durableExecutionSummary(result, { providerId: provider.id }), engineeringContract: executionPackage.engineeringContract, usage: primaryUsageSummary } });
    const changes = diff(workspacePath);
    const artifact = core.createArtifact({ id: id("artifact"), runId: run.id, stepId: step.id, type: "DIFF", name: "git-diff", createdAt: new Date().toISOString(), metadata: { before, changes } });
    await this.store.saveArtifact(artifact); await this.record(run.id, "artifact.created", { artifactId: artifact.id, type: artifact.type });
    const commands = request.verificationCommands || this.inferProjectVerification(workspacePath);
    const verification = await this.verification.verify({ id: id("verification"), runId: run.id, commands, cwd: workspacePath, timeoutMs: policy.timeoutMs });
    await this.store.saveVerification(verification);
    await this.record(run.id, verification.status === "passed" ? "verification.completed" : "verification.failed", { verificationId: verification.id });
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
    let review = Object.freeze({ status: "disabled", verdict: "not-requested", calls: 0 });
    if (this.governance.features.independentReview && reviewRequired(cognitiveBudget) && executionStatus === "completed" && verification.status !== "failed") {
      review = await this._runIndependentReview({ request, task, run, step, provider, workspacePath, cognitiveBudget, changes, verification, evidence: request.evidence || result.evidence });
    }
    const completionTask = request.semanticTask || { id: task.id, acceptanceCriteria: [] };
    const completion = isTaskCompletionEligible(completionTask, { evidence: request.evidence || result.evidence, verification, qualityFindings, deterministic: true });
    const governance = buildGovernance({ config: this.governance, task: completionTask, verification, evidence: request.evidence || result.evidence, sessionWarnings: this.governanceWarnings });
    this.governanceNotices = [...governance.warnings, ...governance.recommendations];
    const strictGate = governance.mode === "strict";
    const hasCriticalFinding = qualityFindings.some((finding) => finding?.blocking || ["BLOCKER", "HIGH"].includes(String(finding?.severity || "").toUpperCase()));
    const reviewBlocking = review.status === "rejected" || review.status === "inconclusive" || review.status === "unavailable";
    const status = executionStatus === "completed" && !reviewBlocking && !hasCriticalFinding && governance.blocking.length === 0 && (!strictGate || (verification.status === "passed" && completion.eligible)) ? "completed" : executionStatus === "cancelled" ? "cancelled" : executionStatus === "timed_out" ? "timed_out" : "failed";
    const completedAt = new Date().toISOString();
    await this.store.saveStep({ ...step, status: status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "failed", completedAt });
    await this.store.saveRun({ ...run, status, startedAt: execution.startedAt, completedAt });
    await this.record(run.id, status === "completed" ? "run.completed" : "run.failed", { status });
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
        prompt: null
      });
      await this.store.saveRun({ ...finalRun, metadata: { ...(finalRun.metadata || {}), cognitiveTelemetry: telemetry } });
    }
    return { run: await this.store.getRun(run.id), verification, qualityFindings, review, engineeringContract: executionPackage.engineeringContract, changes, execution: result, governanceWarnings: governance.warnings, governanceBlocking: governance.blocking, recommendations: governance.recommendations };
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
      const handle = await provider.execute({ prompt: prompt.prompt, workspacePath, model: request.reviewerModel || request.model, sandbox: "read-only", sessionId: `review-${crypto.randomUUID()}`, timeoutMs: getPolicy(request.policyId || "standard")?.timeoutMs, onEvent: (event) => this.record(run.id, event.type, event) });
      const raw = await handle.result;
      // Reviewer process output is untrusted for persistence: a failed
      // reviewer stderr (or a model summary echoing workspace content) is
      // sanitized before becoming a durable summary/artifact.
      const parsed = raw.exitCode === 0 ? parseReviewResult(raw.stdout) : { verdict: "inconclusive", findings: [{ code: "REVIEW_PROCESS_FAILED" }], summary: sanitizeDiagnostic(raw.stderr || "reviewer process failed") };
      const status = parsed.verdict === "approved" ? "approved" : parsed.verdict === "rejected" ? "rejected" : "inconclusive";
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
      await this.store.saveExecution({ ...execution, status: status === "approved" ? "completed" : "failed", completedAt: new Date().toISOString(), metadata: { role: "independent-reviewer", verdict: parsed.verdict, findings: parsed.findings, usage: reviewUsage ? { tool: reviewUsage.tool, provider: reviewUsage.provider, model: reviewUsage.model, sessionId: reviewUsage.sessionId, tokenInput: reviewUsage.tokenInput, tokenOutput: reviewUsage.tokenOutput, cachedInputTokens: reviewUsage.cachedInputTokens, tokenSource: reviewUsage.tokenSource } : null } });
      await this.store.saveArtifact(core.createArtifact({ id: id("review-artifact"), runId: run.id, stepId: step.id, type: "REVIEW", name: "independent-review", createdAt: new Date().toISOString(), metadata: { verdict: parsed.verdict, findings: parsed.findings, summary: sanitizeDiagnostic(parsed.summary || ""), executionId: execution.id, contextTruncated: prompt.truncated } }));
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

  buildPrompt(executionPackage) {
    const taskContext = compactContext(executionPackage.task, {
      files: [],
      skills: executionPackage.skills
    });
    const skillPaths = taskContext.skills.map((skill) => `- ${skill.identity}: ${skill.path}`).join("\n");
    return [executionPackage.profile.instructions || `Act as ${executionPackage.profile.displayName}.`, interactionContract(executionPackage.interaction), `Task: ${taskContext.description}`, `Workspace: ${executionPackage.workspace.path}`, executionPackage.includeGovernanceContext ? `Engineering contract: ${JSON.stringify(executionPackage.engineeringContract)}` : "", skillPaths ? `Resolved skills:\n${skillPaths}` : "", "Work only within the workspace and report concrete changes."].filter(Boolean).join("\n\n");
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

module.exports = { MaestroApplication, ProviderRegistry, projectIdForPath };
