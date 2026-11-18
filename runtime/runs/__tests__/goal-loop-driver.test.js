"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { capabilities } = require("../../core");
const { MaestroApplication, ProviderRegistry } = require("../../application/maestro-application");
const { JsonFileRunStore } = require("../../store");
const { submitExecutablePlan } = require("../executable-submission");
const { createSubmissionWorker } = require("../submission-worker");
const { assessSubmissionGoal, validateGoalLoopDecision } = require("../goal-loop-driver");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const sha = (value) => require("node:crypto").createHash("sha256").update(value).digest("hex");

class FakeOpenCode {
  constructor(exitCode = 0) { this.id = "opencode"; this.calls = 0; this.exitCode = exitCode; }
  async detect() { return { id: this.id, installed: true, executable: "fake-opencode" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute() {
    this.calls++;
    return {
      pid: 10, cancel() {},
      result: Promise.resolve({
        providerId: this.id, pid: 10, exitCode: this.exitCode,
        stdout: this.exitCode === 0 ? "verified" : "", stderr: this.exitCode === 0 ? "" : "boom",
        durationMs: 1, cancelled: false, timedOut: false
      })
    };
  }
}

async function failedSubmissionFixture(t, { budget } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-goal-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projectRoot = path.join(tmp, "project");
  fs.mkdirSync(projectRoot);
  git(projectRoot, "init", "-q");
  git(projectRoot, "config", "user.name", "Fixture");
  git(projectRoot, "config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(projectRoot, "README.md"), "base\n");
  git(projectRoot, "add", "README.md");
  git(projectRoot, "commit", "-qm", "base");
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.initialize();
  await store.createProject({ id: "project-goal-001", path: projectRoot });
  const provider = new FakeOpenCode(1);
  const app = new MaestroApplication({
    projectRoot, store, providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  const content = "Goal fixture prompt with bounded length.";
  const params = {
    clientKey: "submit-goal-key-0001",
    artifact: { id: "artifact-goal-001", version: 1, content, sha256: sha(content) },
    approvedModelUse: true,
    plan: {
      tasks: [
        {
          id: "task-goal-front-001", title: "Frontend step", objective: "Implement the frontend part",
          dependsOn: [], acceptanceCriteria: ["frontend step finished"]
        },
        {
          id: "task-goal-integ-001", title: "Integration step", objective: "Integrate the frontend part",
          dependsOn: ["task-goal-front-001"], acceptanceCriteria: ["integration step finished"]
        }
      ]
    },
    assignments: [
      { taskId: "task-goal-front-001", providerId: "opencode", sandbox: "none" },
      { taskId: "task-goal-integ-001", providerId: "opencode", sandbox: "none" }
    ],
    approval: { decision: "approved", approvedBy: "operator" },
    ...(budget ? { budget } : {})
  };
  const ack = await submitExecutablePlan({
    store, providers: new ProviderRegistry([provider]),
    projectRoot, workspacePath: projectRoot, params
  });
  const worker = createSubmissionWorker({
    application: app, store, projectRoot,
    workerId: "worker-goal-fixed-01", pollIntervalMs: 50
  });
  return { store, ack, worker, provider };
}

test("failed submission without an explicit budget blocks to the human decision", async (t) => {
  const { store, ack, worker } = await failedSubmissionFixture(t);
  const result = await worker.step();
  assert.equal(result.outcomes[0].submissionStatus, "FAILED");
  assert.equal(result.outcomes[0].goalLoop.decision, "BLOCKED_NEEDS_USER");
  assert.equal(result.outcomes[0].goalLoop.reason, "COST_BUDGET_EXHAUSTED");
  const decisions = await store.listGoalLoopDecisions({ submissionId: ack.submissionId });
  assert.equal(decisions.length, 1);
  // Human-gated decisions carry no dispatch proposal at all.
  assert.deepEqual(decisions[0].affectedTaskIds, []);
  assert.deepEqual(decisions[0].failedTaskIds, ["task-goal-front-001"]);
});

test("explicit budget yields a corrective review proposal with proven failure fingerprints", async (t) => {
  const { store, ack, worker } = await failedSubmissionFixture(t, { budget: { maxCostUSD: 5 } });
  const result = await worker.step();
  assert.equal(result.outcomes[0].submissionStatus, "FAILED");
  assert.equal(result.outcomes[0].goalLoop.decision, "CORRECTIVE_REVIEW");
  assert.deepEqual(result.outcomes[0].goalLoop.affectedTaskIds, ["task-goal-front-001", "task-goal-integ-001"]);
  const decisions = await store.listGoalLoopDecisions({ submissionId: ack.submissionId });
  assert.equal(decisions.length, 1);
  const record = validateGoalLoopDecision(decisions[0]);
  assert.match(record.failureFingerprints["task-goal-front-001"], /^[a-f0-9]{64}$/);
  // Same assessment again is an idempotent durable record, not a new entry.
  const again = await assessSubmissionGoal({ store, submissionId: ack.submissionId });
  assert.equal(again.record.id, record.id);
  assert.equal((await store.listGoalLoopDecisions({ submissionId: ack.submissionId })).length, 1);
});

test("assessment refuses non-terminal or manifest-less submissions", async (t) => {
  const { store, ack } = await failedSubmissionFixture(t, { budget: { maxCostUSD: 5 } });
  // The submission is still PENDING_WORKER: no worker cycle ran.
  await assert.rejects(assessSubmissionGoal({ store, submissionId: ack.submissionId }),
    { code: "GOAL_LOOP_INVALID_STATE" });
});
