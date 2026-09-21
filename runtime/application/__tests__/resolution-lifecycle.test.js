"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { capabilities } = require("../../core");
const { MaestroApplication, ProviderRegistry } = require("../maestro-application");
const { JsonFileRunStore } = require("../../store");

class Adapter {
  constructor(id, exitCode = 0, evidence = undefined) {
    this.id = id;
    this.exitCode = exitCode;
    this.evidence = evidence;
    this.requests = [];
  }
  async detect() { return { id: this.id, installed: true, executable: this.id }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute(request) {
    this.requests.push(request);
    return {
      pid: 1,
      cancel() {},
      result: Promise.resolve({
        providerId: this.id,
        pid: 1,
        exitCode: this.exitCode,
        stdout: this.exitCode === 0 ? "ok" : "",
        stderr: this.exitCode === 0 ? "" : "provider failed",
        durationMs: 1,
        cancelled: false,
        timedOut: false,
        evidence: this.evidence
      })
    };
  }
}

function createApp(root, adapters) {
  return new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry(adapters),
    skills: { get: () => null }
  });
}

const passCommand = { name: "test", command: `${process.execPath} -e "process.exit(0)"` };
const failCommand = { name: "test", command: `${process.execPath} -e "process.exit(1)"` };

test("provider handoff creates a checkpoint and continues the same semantic task", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-handoff-"));
  const primary = new Adapter("primary", 1);
  const fallback = new Adapter("fallback", 0);
  const app = createApp(root, [primary, fallback]);

  const outcome = await app.executeTaskWithHandoff({
    providerId: "primary",
    providerFallbacks: ["fallback"],
    model: "primary-only-model",
    description: "Complete task",
    semanticTaskId: "handoff-task",
    semanticTask: { id: "handoff-task", objective: "Complete task", acceptanceCriteria: ["tests pass"] },
    evidence: [{ type: "test", content: "deterministic verifier evidence", acceptanceCriterion: "tests pass", producer: "test-suite", confidence: 100 }],
    verificationCommands: [passCommand]
  });

  assert.equal(outcome.run.status, "completed");
  assert.equal(outcome.run.metadata.resolution.outcome.state, "validated");
  assert.equal(outcome.handoff.switched, true);
  assert.equal(outcome.handoff.providerSwitches, 1);
  assert.equal(primary.requests.length, 1);
  assert.equal(fallback.requests.length, 1);
  assert.equal(primary.requests[0].model, "primary-only-model");
  assert.equal(fallback.requests[0].model, undefined);
  assert.match(fallback.requests[0].prompt, /Provider-neutral continuation checkpoint/u);

  const runs = await app.listRuns({ taskId: "handoff-task" });
  assert.equal(runs.length, 2);
  assert.equal(new Set(runs.map((run) => run.taskId)).size, 1);
  const firstRun = runs.find((run) => run.providerId === "primary");
  assert.ok(firstRun);
  assert.equal((await app.listArtifacts({ runId: firstRun.id })).some((artifact) => artifact.type === "CHECKPOINT"), true);
  assert.equal((await app.store.listEvents({ runId: firstRun.id })).some((event) => event.type === "provider.handoff"), true);
});

test("deterministic validation failure does not switch provider", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-no-handoff-validation-"));
  const primary = new Adapter("primary", 0);
  const fallback = new Adapter("fallback", 0);
  const app = createApp(root, [primary, fallback]);

  const outcome = await app.executeTaskWithHandoff({
    providerId: "primary",
    providerFallbacks: ["fallback"],
    description: "Task with deterministic verifier",
    semanticTaskId: "validation-task",
    semanticTask: { id: "validation-task", objective: "Task with deterministic verifier", acceptanceCriteria: ["tests pass"] },
    evidence: [{ type: "test", content: "deterministic verifier evidence", acceptanceCriterion: "tests pass", producer: "test-suite", confidence: 100 }],
    verificationCommands: [failCommand]
  });

  assert.equal(outcome.run.metadata.resolution.outcome.state, "needs_attention");
  assert.equal(outcome.handoff.providerSwitches, 0);
  assert.equal(outcome.handoff.attempts[0].failureClass, "validation-failure");
  assert.equal(primary.requests.length, 1);
  assert.equal(fallback.requests.length, 0);
});

test("validated outcome history records revoke and revalidate transitions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-outcome-history-"));
  const provider = new Adapter("fake", 0);
  const app = createApp(root, [provider]);
  const base = {
    providerId: "fake",
    description: "Stable task",
    semanticTaskId: "stable-task",
    semanticTask: { id: "stable-task", objective: "Stable task", acceptanceCriteria: ["tests pass"] },
    evidence: [{ type: "test", content: "deterministic verifier evidence", acceptanceCriterion: "tests pass", producer: "test-suite", confidence: 100 }]
  };

  const first = await app.executeRun({ ...base, verificationCommands: [passCommand] });
  assert.equal(first.run.metadata.resolution.outcome.state, "validated");

  const second = await app.executeRun({ ...base, verificationCommands: [failCommand] });
  assert.equal(second.run.metadata.resolution.outcome.state, "needs_attention");

  const third = await app.executeRun({ ...base, verificationCommands: [passCommand] });
  assert.equal(third.run.metadata.resolution.outcome.state, "validated");

  const events = (await app.store.listEvents({}))
    .filter((event) => event.data?.taskId === "stable-task")
    .map((event) => event.type);
  assert.deepEqual(events.filter((type) => type.startsWith("outcome.")), [
    "outcome.validated",
    "outcome.revoked",
    "outcome.revalidated"
  ]);
});

test("persisted evidence is joined into task and mission proof bundles", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-proof-bundle-"));
  const provider = new Adapter("fake", 0);
  const app = createApp(root, [provider]);
  const mission = await app.createMission({ workspacePath: root, objective: "Ship verified change", status: "running" });

  const outcome = await app.executeRun({
    providerId: "fake",
    missionId: mission.id,
    description: "Ship verified change",
    semanticTaskId: "proof-task",
    semanticTask: {
      id: "proof-task",
      objective: "Ship verified change",
      acceptanceCriteria: ["tests pass"],
      evidenceRequirements: ["tests pass"]
    },
    evidence: [{
      type: "test",
      content: "deterministic verifier passed",
      acceptanceCriterion: "tests pass",
      producer: "test-suite",
      confidence: 100
    }],
    verificationCommands: [passCommand]
  });

  assert.equal(outcome.run.metadata.resolution.outcome.state, "validated");
  const persistedTaskId = outcome.run.taskId;
  assert.notEqual(persistedTaskId, "proof-task");
  const persistedTask = await app.getTask(persistedTaskId);
  assert.equal(persistedTask.metadata.semanticTaskId, "proof-task");
  const evidence = await app.listEvidence({ taskId: persistedTaskId });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].runId, outcome.run.id);
  assert.equal(evidence[0].verificationId, outcome.verification.id);

  const taskProof = await app.getTaskProofBundle(persistedTaskId);
  assert.equal(taskProof.latestOutcome.state, "validated");
  assert.equal(taskProof.evidence.length, 1);
  assert.equal(taskProof.runs[0].verifications[0].status, "passed");

  const missionProof = await app.getMissionProofBundle(mission.id);
  assert.equal(missionProof.summary.tasks, 1);
  assert.equal(missionProof.summary.validatedTasks, 1);
  assert.equal(missionProof.summary.validated, true);
  assert.equal(missionProof.mission.resolution.state, "validated");
});


test("completion merges request and provider evidence and binds a semantic task without its own id", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-evidence-merge-"));
  const provider = new Adapter("fake", 0, [{
    type: "provider-evidence",
    content: "provider requirement evidence",
    acceptanceCriterion: "provider requirement",
    producer: "provider"
  }]);
  const app = createApp(root, [provider]);

  const outcome = await app.executeRun({
    providerId: "fake",
    description: "Combine evidence",
    semanticTaskId: "combined-evidence-task",
    semanticTask: {
      objective: "Combine evidence",
      acceptanceCriteria: ["request criterion"],
      evidenceRequirements: ["provider requirement"]
    },
    evidence: [{
      type: "request-evidence",
      content: "request criterion evidence",
      acceptanceCriterion: "request criterion",
      producer: "request"
    }],
    verificationCommands: [passCommand]
  });

  assert.equal(outcome.run.metadata.resolution.outcome.state, "validated");
  const evidence = await app.listEvidence({ taskId: "combined-evidence-task" });
  assert.equal(evidence.length, 2);
  assert.deepEqual(new Set(evidence.map((entry) => entry.acceptanceCriterion)), new Set(["request criterion", "provider requirement"]));
});


test("same semantic task id remains isolated across missions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-mission-task-identity-"));
  const provider = new Adapter("fake", 0);
  const app = createApp(root, [provider]);
  const firstMission = await app.createMission({ workspacePath: root, objective: "First mission", status: "running" });
  const secondMission = await app.createMission({ workspacePath: root, objective: "Second mission", status: "running" });
  const request = {
    providerId: "fake",
    description: "Shared planner task",
    semanticTaskId: "task-1",
    semanticTask: { id: "task-1", objective: "Shared planner task", acceptanceCriteria: [] },
    verificationCommands: [passCommand]
  };

  const first = await app.executeRun({ ...request, missionId: firstMission.id });
  const second = await app.executeRun({ ...request, missionId: secondMission.id });

  assert.notEqual(first.run.taskId, second.run.taskId);
  assert.notEqual(first.run.taskId, "task-1");
  assert.notEqual(second.run.taskId, "task-1");
  assert.equal((await app.getTask(first.run.taskId)).metadata.semanticTaskId, "task-1");
  assert.equal((await app.getTask(second.run.taskId)).metadata.semanticTaskId, "task-1");

  const firstProof = await app.getMissionProofBundle(firstMission.id);
  const secondProof = await app.getMissionProofBundle(secondMission.id);
  assert.deepEqual(firstProof.tasks.map((bundle) => bundle.task.id), [first.run.taskId]);
  assert.deepEqual(secondProof.tasks.map((bundle) => bundle.task.id), [second.run.taskId]);
});

test("pre-execution policy errors never trigger provider fallback", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-no-policy-handoff-"));
  const primary = new Adapter("primary", 0);
  const fallback = new Adapter("fallback", 0);
  const app = createApp(root, [primary, fallback]);

  await assert.rejects(
    app.executeTaskWithHandoff({
      providerId: "primary",
      providerFallbacks: ["fallback"],
      description: "Unauthorized enforce task",
      semanticTaskId: "policy-task",
      semanticTask: { id: "policy-task", objective: "Unauthorized enforce task", acceptanceCriteria: [] },
      resolutionMode: "enforce"
    }),
    /RESOLUTION_ENFORCE_NOT_READY/u
  );

  assert.equal(primary.requests.length, 0);
  assert.equal(fallback.requests.length, 0);
});

test("provider evidence is sanitized before durable persistence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-evidence-redaction-"));
  const token = "ghp_" + "A".repeat(40);
  const provider = new Adapter("fake", 0, [{
    type: `provider-${token}`,
    content: `provider diagnostic Bearer ${token} at /home/alice/private/repo`,
    producer: `provider-${token}`,
    artifactId: "artifact-does-not-exist",
    metadata: { authorization: `Bearer ${token}`, path: "/home/alice/private/repo" }
  }]);
  const app = createApp(root, [provider]);

  const outcome = await app.executeRun({
    providerId: "fake",
    description: "Persist safe evidence",
    semanticTaskId: "safe-evidence",
    semanticTask: { id: "safe-evidence", objective: "Persist safe evidence", acceptanceCriteria: [] },
    verificationCommands: [passCommand]
  });

  const persisted = await app.listEvidence({ taskId: outcome.run.taskId });
  const serialized = JSON.stringify(persisted);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].artifactId, undefined);
  assert.doesNotMatch(serialized, new RegExp(token, "u"));
  assert.doesNotMatch(serialized, /\/home\/alice\/private/u);
  assert.match(serialized, /redacted/u);
});


test("pre-run provider failure is anchored to the fallback run audit trail", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-pre-run-handoff-"));
  const fallback = new Adapter("fallback", 0);
  const app = createApp(root, [fallback]);

  const outcome = await app.executeTaskWithHandoff({
    providerId: "missing-provider",
    providerFallbacks: ["fallback"],
    description: "Recover from unavailable provider",
    semanticTaskId: "pre-run-handoff",
    semanticTask: { id: "pre-run-handoff", objective: "Recover from unavailable provider", acceptanceCriteria: [] },
    verificationCommands: [passCommand]
  });

  assert.equal(outcome.run.providerId, "fallback");
  assert.equal(outcome.handoff.providerSwitches, 1);
  assert.equal(outcome.handoff.attempts[0].providerId, "missing-provider");
  assert.equal(outcome.handoff.attempts[0].runId, null);

  const artifacts = await app.listArtifacts({ runId: outcome.run.id });
  assert.equal(artifacts.some((artifact) => artifact.type === "CHECKPOINT" && artifact.name === "provider-handoff-pre-run"), true);
  const events = await app.store.listEvents({ runId: outcome.run.id });
  assert.equal(events.some((event) => event.type === "provider.handoff" && event.data?.preRunFailure === true), true);
});
