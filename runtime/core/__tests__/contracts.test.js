"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const core = require("../index");

test("task, run, step, and execution establish immutable traceability", () => {
  const task = core.createTask({ id: "task-1", description: "Corrigir validação" });
  const run = core.createRun({ id: "run-1", taskId: task.id, providerId: "codex", startedAt: new Date("2026-08-10T00:00:00Z") });
  const step = core.createStep({ id: "step-1", runId: run.id, profileId: "developer" });
  const execution = core.createExecution({ id: "execution-1", runId: run.id, stepId: step.id, providerId: "codex" });

  assert.equal(task.kind, "task");
  assert.equal(run.status, "pending");
  assert.equal(run.startedAt, "2026-08-10T00:00:00.000Z");
  assert.equal(step.profileId, "developer");
  assert.equal(execution.providerId, "codex");
  assert.ok(Object.isFrozen(task));
  assert.ok(Object.isFrozen(run));
});

test("missions are the project-scoped orchestration root", () => {
  const mission = core.createMission({ id: "mission-1", projectId: "project-1", objective: "Implementar o cockpit", mode: "team" });
  assert.equal(mission.kind, "mission");
  assert.equal(mission.status, "draft");
  assert.equal(mission.mode, "team");
  assert.ok(Object.isFrozen(mission));
  assert.throws(() => core.createMission({ id: "mission-1", projectId: "project-1", objective: "x", status: "running-away" }), /mission.status/u);
});

test("artifacts preserve arbitrary future artifact types without provider coupling", () => {
  const artifact = core.createArtifact({ id: "artifact-1", runId: "run-1", type: "TEST_RESULT", uri: "store://artifact-1" });

  assert.equal(artifact.type, "TEST_RESULT");
  assert.equal(artifact.uri, "store://artifact-1");
});

test("verification represents actual command evidence", () => {
  const verification = core.createVerification({
    id: "verification-1",
    runId: "run-1",
    status: "passed",
    checks: [{ name: "tests", command: "node --test", exitCode: 0, stdout: "ok", stderr: "", durationMs: 215 }]
  });

  assert.deepEqual(verification.checks[0], {
    name: "tests",
    command: "node --test",
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    durationMs: 215
  });
  assert.ok(Object.isFrozen(verification.checks));
  assert.ok(Object.isFrozen(verification.checks[0]));
});

test("provider capabilities are explicit, known, and default to false", () => {
  const provider = core.createProviderDescriptor({
    id: "example",
    displayName: "Example",
    capabilities: { headless: true, streaming: true }
  });

  assert.equal(provider.capabilities.headless, true);
  assert.equal(provider.capabilities.streaming, true);
  assert.equal(provider.capabilities.mcp, false);
  assert.throws(() => core.createProviderDescriptor({
    id: "bad",
    displayName: "Bad",
    capabilities: { invented: true }
  }), /not a known capability/u);
});

test("execution profiles and policies remain separate concepts", () => {
  const profile = core.createExecutionProfile({
    id: "developer",
    displayName: "Developer",
    instructions: "Implement safely.",
    defaultVerification: ["test"],
    recommendedSkills: ["project/testing"]
  });
  const policy = core.createExecutionPolicy({
    id: "standard",
    displayName: "Standard",
    requiredCapabilities: ["headless"],
    timeoutMs: 300000
  });

  assert.equal(profile.kind, "execution_profile");
  assert.equal(policy.kind, "execution_policy");
  assert.deepEqual(policy.requiredCapabilities, ["headless"]);
});

test("invalid domain input is rejected at the boundary", () => {
  assert.throws(() => core.createTask({ id: "task-1" }), /task.description/u);
  assert.throws(() => core.createRun({ id: "run-1", taskId: "task-1", status: "done" }), /run.status/u);
  assert.throws(() => core.createVerification({
    id: "verification-1",
    runId: "run-1",
    checks: [{ name: "tests", command: "node --test", exitCode: -1 }]
  }), /exitCode/u);
  assert.throws(() => core.createExecutionPolicy({
    id: "fast",
    displayName: "Fast",
    requiredCapabilities: ["telepathy"]
  }), /not a known capability/u);
});

test("project and snapshot establish workspace identity", () => {
  const project = core.createProject({ id: "proj-1", workspaceRoot: "/home/user/proj", name: "MyProj" });
  const snapshot = core.createProjectSnapshot({
    projectId: "proj-1",
    languages: ["javascript", "typescript"],
    frameworks: ["react"],
    packageManagers: ["npm"],
    architecture: "unknown",
    frontend: "react",
    backend: "unknown",
    tests: "jest",
    skills: ["forms"],
    timestamp: new Date("2026-08-10T00:00:00Z")
  });

  assert.equal(project.kind, "project");
  assert.equal(project.workspaceRoot, "/home/user/proj");
  assert.equal(snapshot.kind, "project_snapshot");
  assert.deepEqual(snapshot.frameworks, ["react"]);
  assert.ok(Object.isFrozen(project));
  assert.ok(Object.isFrozen(snapshot));
});

test("intent session manages the briefing process", () => {
  const session = core.createIntentSession({
    id: "sess-1",
    projectId: "proj-1",
    rawIntent: "Criar form",
    facts: ["React is used"],
    assumptions: ["Use Zod"],
    questions: ["How to manage state?"],
    answers: ["Redux"],
    readinessScore: 80
  });

  assert.equal(session.kind, "intent_session");
  assert.equal(session.readinessScore, 80);
  assert.deepEqual(session.facts, ["React is used"]);
  assert.throws(() => core.createIntentSession({ id: "sess-1", projectId: "proj-1", rawIntent: "Criar form", readinessScore: 101 }), /readinessScore/u);
});

test("mission brief specifies engineering context before planning", () => {
  const brief = core.createMissionBrief({
    id: "brief-1",
    intentSessionId: "sess-1",
    objective: "Create product form",
    requirements: ["Must validate"],
    userDecisions: ["Use Zod"],
    constraints: ["No new deps"],
    relevantContext: "src/forms"
  });

  assert.equal(brief.kind, "mission_brief");
  assert.equal(brief.objective, "Create product form");
  assert.deepEqual(brief.requirements, ["Must validate"]);
});

test("task graph manages dependencies", () => {
  const graph = core.createTaskGraph({
    id: "graph-1",
    missionId: "mission-1",
    tasks: [core.createTask({ id: "t1", description: "d1" }), core.createTask({ id: "t2", description: "d2" })],
    dependencies: { "t2": ["t1"] }
  });

  assert.equal(graph.kind, "task_graph");
  assert.equal(graph.tasks.length, 2);
  assert.deepEqual(graph.dependencies, { "t2": ["t1"] });
});

test("evidence represents verifiable output", () => {
  const evidence = core.createEvidence({
    id: "ev-1",
    taskId: "t1",
    type: "git_diff",
    content: "+ const a = 1;",
    confidence: 100
  });

  assert.equal(evidence.kind, "evidence");
  assert.equal(evidence.type, "git_diff");
  assert.throws(() => core.createEvidence({ id: "ev-1", taskId: "t1", type: "git_diff", content: "x", confidence: -5 }), /confidence/u);
});

test("attention request requires human intervention", () => {
  const req = core.createAttentionRequest({
    id: "att-1",
    type: "APPROVAL",
    message: "Deploy?",
    context: "prod",
    status: "pending"
  });

  assert.equal(req.kind, "attention_request");
  assert.equal(req.type, "APPROVAL");
  assert.throws(() => core.createAttentionRequest({ id: "att-1", type: "INVALID_TYPE", message: "m", status: "pending" }), /attention request.type/u);
});

test("skill acts as verifiable capability", () => {
  const skill = core.createSkill({
    id: "skill-1",
    name: "tester",
    source: "maestro",
    verification: "maestro_verified",
    routingHints: { minTier: "economy" }
  });

  assert.equal(skill.kind, "skill");
  assert.equal(skill.source, "maestro");
  assert.throws(() => core.createSkill({ id: "s1", name: "n1", source: "alien", verification: "unverified" }), /skill.source/u);
});
