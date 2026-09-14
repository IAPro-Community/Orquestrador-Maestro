"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { capabilities } = require("../../core");
const { MaestroApplication, ProviderRegistry } = require("../maestro-application");
const { JsonFileRunStore } = require("../../store");

class FakeAdapter {
  constructor() { this.id = "fake"; this.prompts = []; }
  async detect() { return { id: this.id, installed: true, executable: "fake" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute(request) {
    this.prompts.push(request.prompt);
    request.onEvent({ type: "provider.started", providerId: this.id, pid: 1 });
    request.onEvent({ type: "provider.output", providerId: this.id, stream: "stdout", chunk: "ok" });
    return { pid: 1, cancel() {}, result: Promise.resolve({ providerId: this.id, pid: 1, exitCode: 0, stdout: "ok", stderr: "", durationMs: 1, cancelled: false, timedOut: false }) };
  }
}

class ReviewAdapter extends FakeAdapter {
  supportsReadOnlyReview() { return true; }
  async execute(request) {
    this.prompts.push(request.prompt);
    const review = this.prompts.length > 1 ? JSON.stringify({ verdict: "approved", findings: [], summary: "criteria verified" }) : "ok";
    return { pid: 1, cancel() {}, result: Promise.resolve({ providerId: this.id, pid: 1, exitCode: 0, stdout: review, stderr: "", durationMs: 1, cancelled: false, timedOut: false }) };
  }
}

test("application turns a task into a persisted provider run with real verification", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-application-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: `${process.execPath} -e \"process.exit(0)\"` } }), "utf8");
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new FakeAdapter()]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({ description: "Testar runtime", providerId: "fake", verificationCommands: [{ name: "test", command: `${process.execPath} -e \"process.exit(0)\"` }] });
  assert.equal(outcome.run.status, "completed");
  assert.equal(outcome.verification.status, "passed");
  assert.ok((await app.listArtifacts({ runId: outcome.run.id })).some((artifact) => artifact.type === "DIFF"));
  const projects = await app.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].status, "healthy");
  const inspection = await app.inspectRun(outcome.run.id);
  assert.equal(inspection.task.id, outcome.run.taskId);
  assert.equal(inspection.verification.status, "passed");
});

test("guided engineering quality findings prevent a false completed run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-quality-gate-"));
  fs.writeFileSync(path.join(root, "large-module.js"), `${"const value = 1;\n".repeat(801)}`, "utf8");
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new FakeAdapter()]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({
    description: "Revisar módulo existente",
    providerId: "fake",
    profileId: "guided-engineering",
    verificationCommands: [{ name: "test", command: `${process.execPath} -e "process.exit(0)"` }]
  });
  assert.equal(outcome.verification.status, "passed");
  assert.equal(outcome.qualityFindings.some((finding) => finding.code === "excessive-file-responsibility"), true);
  assert.equal(outcome.run.status, "failed");
});

test("a skipped verification warns without breaking a compatibility run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-skipped-verification-"));
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new FakeAdapter()]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({ providerId: "fake", description: "Run without checks", verificationCommands: [] });
  assert.equal(outcome.verification.status, "skipped");
  assert.equal(outcome.run.status, "completed");
  assert.equal(outcome.governanceWarnings.length, 1);
});

test("independent review is opt-in, risk based, and uses a fresh read-only execution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-independent-review-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "test"], { cwd: root });
  fs.writeFileSync(path.join(root, "tracked.js"), "module.exports = 'before';\n", "utf8");
  execFileSync("git", ["add", "tracked.js"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  fs.writeFileSync(path.join(root, "tracked.js"), "module.exports = 'changed';\n", "utf8");
  const provider = new ReviewAdapter();
  const app = new MaestroApplication({
    projectRoot: root,
    governance: { features: { independentReview: true } },
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({
    providerId: "fake",
    description: "Alterar autenticação",
    semanticTask: { id: "auth", objective: "Alterar autenticação", title: "Auth", risk: "high", complexity: "complex", changeClass: "security-compliance", acceptanceCriteria: ["tests pass"] },
    verificationCommands: [{ name: "test", command: `${process.execPath} -e "process.exit(0)"` }]
  });
  assert.equal(provider.prompts.length, 2);
  assert.equal(outcome.review.status, "approved");
  assert.equal(outcome.run.status, "completed");
  assert.equal((await app.listArtifacts({ runId: outcome.run.id })).some((artifact) => artifact.type === "REVIEW"), true);
  const executions = await app.store.listExecutions({ runId: outcome.run.id });
  assert.equal(executions.filter((item) => item.metadata?.role === "independent-reviewer").length, 1);
  assert.match(provider.prompts[1], /OBJECTIVE/u);
  assert.match(provider.prompts[1], /module\.exports = 'changed'/u);
  assert.equal(provider.prompts[1].includes(provider.prompts[0]), false);
});

test("independent review fails closed when the patch is incomplete", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-incomplete-review-"));
  const provider = new ReviewAdapter();
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  const review = await app._runIndependentReview({
    request: {}, task: {}, run: {}, step: {}, provider, workspacePath: root,
    cognitiveBudget: { contextTokens: 12000 },
    changes: { available: true, patchComplete: false, patch: "partial patch" },
    verification: { status: "passed" }, evidence: []
  });
  assert.equal(review.status, "inconclusive");
  assert.equal(review.calls, 0);
  assert.equal(provider.prompts.length, 0);
});

test("independent review does not call the provider when the prompt budget truncates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-truncated-review-"));
  const provider = new ReviewAdapter();
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  const review = await app._runIndependentReview({
    request: {}, task: {}, run: {}, step: {}, provider, workspacePath: root,
    cognitiveBudget: { contextTokens: 1000 },
    changes: { available: true, patchComplete: true, changedFiles: ["big.js"], workingTreePatch: "x".repeat(200000) },
    verification: { status: "passed" }, evidence: []
  });
  assert.equal(review.status, "inconclusive");
  assert.equal(review.calls, 0);
  assert.equal(provider.prompts.length, 0);
});

test("independent review does not call the provider when there is nothing to review", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-empty-review-"));
  const provider = new ReviewAdapter();
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  const review = await app._runIndependentReview({
    request: {}, task: {}, run: {}, step: {}, provider, workspacePath: root,
    cognitiveBudget: { contextTokens: 12000 },
    changes: { available: true, patchComplete: true, changedFiles: [], untrackedFiles: [] },
    verification: { status: "passed" }, evidence: []
  });
  assert.equal(review.status, "inconclusive");
  assert.equal(review.calls, 0);
  assert.equal(provider.prompts.length, 0);
});

test("LEAN and STANDARD runs do not add independent review calls", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-budget-review-calls-"));
  const provider = new ReviewAdapter();
  const app = new MaestroApplication({
    projectRoot: root,
    governance: { features: { independentReview: true } },
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  const verificationCommands = [{ name: "test", command: `${process.execPath} -e "process.exit(0)"` }];
  await app.executeRun({ providerId: "fake", description: "Tiny change", semanticTask: { id: "lean", objective: "Tiny change", risk: "low", complexity: "simple", changeClass: "trivial", acceptanceCriteria: [] }, verificationCommands });
  await app.executeRun({ providerId: "fake", description: "Normal change", semanticTask: { id: "standard", objective: "Normal change", risk: "medium", complexity: "medium", changeClass: "local", acceptanceCriteria: [] }, verificationCommands });
  assert.equal(provider.prompts.length, 2);
  const executions = await app.store.listExecutions({});
  assert.equal(executions.filter((item) => item.metadata?.role === "independent-reviewer").length, 0);
});

test("task descriptions derive risk budgets and strict execution gates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-derived-risk-"));
  const compatible = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new FakeAdapter()]),
    skills: { get: () => null }
  });
  const prepared = await compatible.createRun({ providerId: "fake", description: "Alterar autenticação e permissões", semanticTask: { changeClass: "local" } });
  assert.equal(prepared.run.metadata.cognitiveBudget.tier, "assurance");
  assert.equal(prepared.run.metadata.cognitiveBudget.reviewRequirement, "independent");

  const strict = new MaestroApplication({
    projectRoot: root,
    governance: { mode: "strict" },
    store: new JsonFileRunStore({ filePath: path.join(root, "strict-runs.json") }),
    providers: new ProviderRegistry([new FakeAdapter()]),
    skills: { get: () => null }
  });
  await assert.rejects(strict.createRun({ providerId: "fake", description: "Alterar permissões" }), /high-risk execution requires/u);
});

test("critical tasks block before provider execution without human approval", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-critical-block-"));
  const adapter = new FakeAdapter();
  const app = new MaestroApplication({ projectRoot: root, store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }), providers: new ProviderRegistry([adapter]), skills: { get: () => null } });
  const outcome = await app.executeRun({ providerId: "fake", description: "alterar autenticação", semanticTask: { id: "critical-1", objective: "alterar autenticação", risk: "critical", complexity: "complex" }, verificationCommands: [] });
  assert.equal(outcome.run.status, "blocked");
  assert.equal(adapter.prompts.length, 0);
  assert.match(outcome.review.reason, /human-approval-required/u);
  assert.equal(outcome.run.metadata.cognitiveTelemetry.primaryCalls, 0);
});

test("critical tasks execute once when an existing approval record is granted", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-critical-approved-"));
  const adapter = new FakeAdapter();
  const app = new MaestroApplication({ projectRoot: root, store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }), providers: new ProviderRegistry([adapter]), skills: { get: () => null } });
  const outcome = await app.executeRun({ providerId: "fake", description: "alterar autenticação", semanticTask: { id: "critical-2", objective: "alterar autenticação", risk: "critical", complexity: "complex" }, approval: { userDecision: "approved" }, verificationCommands: [] });
  assert.equal(outcome.run.status, "completed");
  assert.equal(adapter.prompts.length, 1);
});

test("unsupported assurance reviewer blocks before primary provider execution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-review-preflight-"));
  const adapter = new FakeAdapter();
  const app = new MaestroApplication({ projectRoot: root, store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }), providers: new ProviderRegistry([adapter]), skills: { get: () => null }, governance: { features: { independentReview: true } } });
  const outcome = await app.executeRun({ providerId: "fake", description: "migrar autenticação", semanticTask: { id: "assurance-1", objective: "migrar autenticação", risk: "high", complexity: "complex" }, verificationCommands: [] });
  assert.equal(outcome.run.status, "blocked");
  assert.equal(adapter.prompts.length, 0);
  assert.match(outcome.review.reason, /reviewer-capability-unavailable/u);
  assert.equal(outcome.run.metadata.cognitiveTelemetry.primaryCalls, 0);
});

test("skill budget loads at most maxSkills and reports bounded telemetry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-skill-budget-"));
  const loaded = new Map([["a", { id: "a" }], ["b", { id: "b" }], ["c", { id: "c" }]]);
  const adapter = new FakeAdapter();
  const app = new MaestroApplication({ projectRoot: root, store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }), providers: new ProviderRegistry([adapter]), skills: { get: (id) => loaded.get(id) }, governance: { cognitiveBudget: { standard: { maxSkills: 2 } } } });
  const outcome = await app.executeRun({ providerId: "fake", description: "adicionar validação", semanticTask: { id: "standard-1", objective: "adicionar validação", risk: "low", complexity: "medium" }, skills: [{ id: "a", role: "explicit" }, { id: "b", role: "supporting" }, { id: "c", role: "supporting" }], verificationCommands: [] });
  assert.equal(outcome.run.status, "completed");
  const telemetry = (await app.listRuns({})).find((run) => run.id === outcome.run.id).metadata.cognitiveTelemetry;
  assert.equal(telemetry.skillsRequested, 3);
  assert.equal(telemetry.skillsLoaded, 2);
  assert.equal(telemetry.maxSkills, 2);
});

test("compatibility mode preserves the native prompt and strict mode opts into governance context", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-prompt-compatibility-"));
  const compatibilityProvider = new FakeAdapter();
  const compatibility = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "compatibility-runs.json") }),
    providers: new ProviderRegistry([compatibilityProvider]),
    skills: { get: () => null }
  });
  await compatibility.executeRun({ providerId: "fake", description: "Preservar prompt", verificationCommands: [] });
  assert.equal(compatibilityProvider.prompts[0].includes("Engineering contract:"), false);

  const strictProvider = new FakeAdapter();
  const strict = new MaestroApplication({
    projectRoot: root,
    governance: { mode: "strict" },
    store: new JsonFileRunStore({ filePath: path.join(root, "strict-runs.json") }),
    providers: new ProviderRegistry([strictProvider]),
    skills: { get: () => null }
  });
  await strict.executeRun({ providerId: "fake", description: "Usar governança explícita", verificationCommands: [{ name: "ok", command: `${process.execPath} -e "process.exit(0)"` }], evidence: [{ type: "test", value: "ok" }] });
  assert.equal(strictProvider.prompts[0].includes("Engineering contract:"), true);
});

test("projects can be registered before their first Run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-project-"));
  const app = new MaestroApplication({ projectRoot: root, store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }) });
  const project = await app.registerProject({ projectPath: root });
  assert.equal(project.known, true);
  assert.equal((await app.listProjects())[0].id, project.id);
});

test("missions persist independently from runs and remain project-scoped", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-mission-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") });
  const app = new MaestroApplication({ projectRoot: root, store });
  await app.initialize();
  const mission = await app.createMission({ workspacePath: root, objective: "Organizar o cockpit", mode: "team" });
  assert.equal((await app.listMissions({ projectId: mission.projectId })).length, 1);
  const updated = await app.updateMission(mission.id, { status: "awaiting_approval", plan: { tasks: [] } });
  assert.equal(updated.status, "awaiting_approval");
  assert.deepEqual((await app.getMission(mission.id)).plan, { tasks: [] });
});

test("agents receive distinct automatic worktrees so providers can run concurrently", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-concurrent-agents-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") });
  const created = [];
  const app = new MaestroApplication({
    projectRoot: root, store,
    workspaces: { createSessionWorktree: async ({ sessionId }) => ({ id: sessionId, path: path.join(root, "worktrees", sessionId), isolated: true }) },
    terminalSessions: {
      create: async (request) => { created.push(request); return { id: request.sessionId, ...request, status: "active" }; }
    }
  });

  await app.createTerminalSession({ workspacePath: root, kind: "agent", providerId: "codex", backend: "pty" });
  await app.createTerminalSession({ workspacePath: root, kind: "agent", providerId: "opencode", backend: "pty" });

  assert.notEqual(created[0].workspacePath, created[1].workspacePath);
  assert.equal(created.every((request) => request.isolation === "worktree"), true);
  assert.equal(created.every((request) => request.sourceWorkspacePath === root), true);
});

test("application orchestrates the intent session and creates a mission brief", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-app-intent-"));
  const store = new JsonFileRunStore({ filePath: path.join(root, "runs.json") });
  const app = new MaestroApplication({ projectRoot: root, store });

  const session = await app.startIntentSession({ workspacePath: root, rawIntent: "Criar form" });
  assert.equal(session.rawIntent, "Criar form");
  assert.equal(session.readinessScore, 0);

  const updated = await app.updateIntentSession(session.id, { readinessScore: 100, facts: ["React"] });
  assert.equal(updated.readinessScore, 100);

  const brief = await app.approveMissionBrief(session.id, { objective: "Criar form" });
  assert.equal(brief.objective, "Criar form");
  assert.equal(brief.intentSessionId, session.id);
});
