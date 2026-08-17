"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { capabilities } = require("../../core");
const { MaestroApplication, ProviderRegistry } = require("../maestro-application");
const { JsonFileRunStore } = require("../../store");

class FakeAdapter {
  constructor() { this.id = "fake"; }
  async detect() { return { id: this.id, installed: true, executable: "fake" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute(request) {
    request.onEvent({ type: "provider.started", providerId: this.id, pid: 1 });
    request.onEvent({ type: "provider.output", providerId: this.id, stream: "stdout", chunk: "ok" });
    return { pid: 1, cancel() {}, result: Promise.resolve({ providerId: this.id, pid: 1, exitCode: 0, stdout: "ok", stderr: "", durationMs: 1, cancelled: false, timedOut: false }) };
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
