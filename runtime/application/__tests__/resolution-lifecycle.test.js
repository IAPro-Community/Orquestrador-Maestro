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
  constructor(id, exitCode = 0) {
    this.id = id;
    this.exitCode = exitCode;
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
        timedOut: false
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
    semanticTask: { id: "stable-task", objective: "Stable task", acceptanceCriteria: ["tests pass"] }
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
      evidenceRequirements: ["test evidence"]
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
  const evidence = await app.listEvidence({ taskId: "proof-task" });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].runId, outcome.run.id);
  assert.equal(evidence[0].verificationId, outcome.verification.id);

  const taskProof = await app.getTaskProofBundle("proof-task");
  assert.equal(taskProof.latestOutcome.state, "validated");
  assert.equal(taskProof.evidence.length, 1);
  assert.equal(taskProof.runs[0].verifications[0].status, "passed");

  const missionProof = await app.getMissionProofBundle(mission.id);
  assert.equal(missionProof.summary.tasks, 1);
  assert.equal(missionProof.summary.validatedTasks, 1);
  assert.equal(missionProof.summary.validated, true);
  assert.equal(missionProof.mission.resolution.state, "validated");
});
