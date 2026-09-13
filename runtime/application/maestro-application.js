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
const { isTaskCompletionEligible, isRiskExecutionEligible, evaluateCognitiveBudget } = require("../governance/change-governance");
const { reviewRequired, buildReviewPrompt, parseReviewResult } = require("../governance/independent-review");
const { mergeConfig, loadGovernanceConfig, writeGovernanceConfig, buildGovernance } = require("../governance/compatibility");
const { resolveProjectMaestroRoot } = require("../config/maestro-paths");
const { resolveInteractionProfile, interactionContract } = require("../interaction");

function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function projectIdForPath(workspacePath) { return `project-${crypto.createHash("sha256").update(path.resolve(workspacePath)).digest("hex").slice(0, 16)}`; }

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
    const semanticChangeClass = request.semanticTask?.changeClass;
    const derivedProfileId = request.profileId || "developer";
    if (this.governance.mode === "strict" && !isRiskExecutionEligible(semanticChangeClass, { profileId: derivedProfileId, riskOverride: request.riskOverride })) {
      throw new Error("high-risk execution requires guided-engineering profile or an explicit risk override");
    }
    const profile = getProfile(request.profileId || derivedProfileId);
    if (!policy || !profile) throw new Error("unknown execution profile or policy");
    const capabilities = await provider.capabilities();
    for (const capability of policy.requiredCapabilities) if (!capabilities[capability]) throw new Error(`provider ${provider.id} lacks ${capability}`);

    const workspacePath = path.resolve(request.workspacePath || this.projectRoot);
    const projectId = request.projectId || projectIdForPath(workspacePath);
    const taskMetadata = {
      ...(request.missionId ? { missionId: request.missionId } : {}),
      ...(request.semanticTaskId ? { semanticTaskId: request.semanticTaskId } : {}),
      ...(request.semanticTask ? { semanticTask: request.semanticTask } : {}),
      ...(request.riskOverride ? { riskOverride: request.riskOverride } : {}),
      cognitiveBudget: evaluateCognitiveBudget(request.semanticTask || {}, this.governance.cognitiveBudget)
    };
    const task = core.createTask({ id: id("task"), description: request.description, projectId, createdAt: new Date().toISOString(), metadata: taskMetadata });
    const run = core.createRun({ id: id("run"), taskId: task.id, providerId: provider.id, status: "pending", metadata: taskMetadata });
    const step = core.createStep({ id: id("step"), runId: run.id, profileId: profile.id, status: "pending" });
    await this.store.createProject({ id: projectId, path: workspacePath, name: path.basename(workspacePath), createdAt: new Date().toISOString() });
    await this.store.saveTask(task); await this.store.saveRun(run); await this.store.saveStep(step);
    await this.record(run.id, "run.created", { taskId: task.id, providerId: provider.id });
    return { task, run, step, profile, policy, provider, capabilities, workspacePath };
  }

  async executeRun(request) {
    const prepared = await this.createRun(request);
    const { task, run, step, profile, policy, provider, workspacePath } = prepared;
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
    const executionPackage = Object.freeze({
      task, run, step, profile, policy,
      workspace: { path: workspacePath },
      permissions: request.permissions || {},
      skills: (request.skills || []).map((identity) => this.skills.get(identity)).filter(Boolean),
      previousArtifacts: request.previousArtifacts || [],
      engineeringContract,
      interaction,
      includeGovernanceContext: this.governance.mode === "strict" || request.includeGovernanceContext === true
    });
    const handle = await provider.execute({ prompt: this.buildPrompt(executionPackage), workspacePath, model: request.model, sandbox: request.sandbox, permissionMode: request.permissionMode, mode: request.mode, agent: request.agent, sessionId: request.sessionId, continue: request.continue, timeoutMs: policy.timeoutMs, onEvent: (event) => this.record(run.id, event.type, event) });
    this.activeRuns.set(run.id, handle);
    const result = await handle.result;
    this.activeRuns.delete(run.id);
    const executionStatus = result.cancelled ? "cancelled" : result.timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed";
    await this.store.saveExecution({ ...execution, status: executionStatus, completedAt: new Date().toISOString(), metadata: { ...result, engineeringContract: executionPackage.engineeringContract } });
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
      await this.store.saveRun({ ...finalRun, metadata: { ...(finalRun.metadata || {}), cognitiveTelemetry: { modelCalls: 1 + (review.calls || 0), reviewers: review.calls || 0, retries: 0, skillsInjected: executionPackage.skills.length, tokenSource: "unavailable", outcome: status } } });
    }
    return { run: await this.store.getRun(run.id), verification, qualityFindings, review, engineeringContract: executionPackage.engineeringContract, changes, execution: result, governanceWarnings: governance.warnings, governanceBlocking: governance.blocking, recommendations: governance.recommendations };
  }

  async _runIndependentReview({ request, task, run, step, provider, workspacePath, cognitiveBudget, changes, verification, evidence }) {
    if (typeof provider.supportsReadOnlyReview !== "function" || !provider.supportsReadOnlyReview()) {
      return Object.freeze({ status: "unavailable", verdict: "inconclusive", calls: 0, reason: "provider-read-only-review-unavailable" });
    }
    const reviewDiff = JSON.stringify({
      changedFiles: changes?.changedFiles || [],
      stats: changes?.stats || [],
    });
    const prompt = buildReviewPrompt({ task: request.semanticTask || task, diff: reviewDiff, verification, evidence, constraints: request.constraints || [], maxTokens: cognitiveBudget.contextTokens });
    const execution = core.createExecution({ id: id("review-execution"), runId: run.id, stepId: step.id, providerId: provider.id, status: "running", startedAt: new Date().toISOString(), metadata: { role: "independent-reviewer", sourceRunId: run.id, contextTruncated: prompt.truncated } });
    await this.store.saveExecution(execution); await this.record(run.id, "review.started", { executionId: execution.id });
    try {
      const handle = await provider.execute({ prompt: prompt.prompt, workspacePath, model: request.reviewerModel || request.model, sandbox: "read-only", sessionId: `review-${crypto.randomUUID()}`, timeoutMs: getPolicy(request.policyId || "standard")?.timeoutMs, onEvent: (event) => this.record(run.id, event.type, event) });
      const raw = await handle.result;
      const parsed = raw.exitCode === 0 ? parseReviewResult(raw.stdout) : { verdict: "inconclusive", findings: [{ code: "REVIEW_PROCESS_FAILED" }], summary: raw.stderr || "reviewer process failed" };
      const status = parsed.verdict === "approved" ? "approved" : parsed.verdict === "rejected" ? "rejected" : "inconclusive";
      await this.store.saveExecution({ ...execution, status: status === "approved" ? "completed" : "failed", completedAt: new Date().toISOString(), metadata: { role: "independent-reviewer", verdict: parsed.verdict, findings: parsed.findings } });
      await this.store.saveArtifact(core.createArtifact({ id: id("review-artifact"), runId: run.id, stepId: step.id, type: "REVIEW", name: "independent-review", createdAt: new Date().toISOString(), metadata: { verdict: parsed.verdict, findings: parsed.findings, summary: parsed.summary, executionId: execution.id, contextTruncated: prompt.truncated } }));
      await this.record(run.id, status === "approved" ? "review.completed" : "review.failed", { executionId: execution.id, verdict: parsed.verdict });
      return Object.freeze({ status, verdict: parsed.verdict, findings: parsed.findings, summary: parsed.summary, calls: 1, contextTruncated: prompt.truncated });
    } catch (error) {
      await this.store.saveExecution({ ...execution, status: "failed", completedAt: new Date().toISOString(), metadata: { role: "independent-reviewer", error: error.message } });
      await this.record(run.id, "review.failed", { executionId: execution.id, reason: error.message });
      return Object.freeze({ status: "inconclusive", verdict: "inconclusive", calls: 1, reason: error.message });
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
    await this.store.appendEvent(event); this.events.emit("event", event); return event;
  }
}

module.exports = { MaestroApplication, ProviderRegistry, projectIdForPath };
