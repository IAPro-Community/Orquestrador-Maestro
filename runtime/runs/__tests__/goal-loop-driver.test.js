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
const { assessSubmissionGoal, validateGoalLoopDecision, collectTaskResults } = require("../goal-loop-driver");

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

// Failed provider that still reports its own billed cost per step. This is the
// real-world shape (opencode `step_finish`) that makes a corrective review
// priceable without any invented price table.
class PricedOpenCode {
  constructor(exitCode = 1, cost = 0.75) { this.id = "opencode"; this.calls = 0; this.exitCode = exitCode; this.cost = cost; }
  async detect() { return { id: this.id, installed: true, executable: "fake-opencode" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute() {
    this.calls++;
    const stdout = [
      JSON.stringify({ type: "step_start", sessionID: "op-priced", modelID: "claude-test", providerID: "anthropic" }),
      JSON.stringify({ type: "step_finish", sessionID: "op-priced", part: { tokens: { input: 1_000_000, output: 0 }, cost: this.cost } })
    ].join("\n");
    return {
      pid: 11, cancel() {},
      result: Promise.resolve({
        providerId: this.id, pid: 11, exitCode: this.exitCode,
        stdout, stderr: this.exitCode === 0 ? "" : "boom",
        durationMs: 1, cancelled: false, timedOut: false
      })
    };
  }
}

async function failedSubmissionFixture(t, { budget, provider: providerOverride } = {}) {
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
  const provider = providerOverride || new FakeOpenCode(1);
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

test("priced budget cannot unlock unattended correction with unknown actual USD usage", async (t) => {
  const { store, ack, worker } = await failedSubmissionFixture(t, { budget: { maxCostUSD: 5 } });
  const result = await worker.step();
  assert.equal(result.outcomes[0].submissionStatus, "FAILED");
  assert.equal(result.outcomes[0].goalLoop.decision, "BLOCKED_NEEDS_USER");
  assert.equal(result.outcomes[0].goalLoop.reason, "COST_USAGE_UNAVAILABLE");
  assert.deepEqual(result.outcomes[0].goalLoop.affectedTaskIds, []);
  const decisions = await store.listGoalLoopDecisions({ submissionId: ack.submissionId });
  assert.equal(decisions.length, 1);
  const record = validateGoalLoopDecision(decisions[0]);
  assert.equal(record.usage.totalCostUSD, null);
  assert.match(record.failureFingerprints["task-goal-front-001"], /^[a-f0-9]{64}$/);
  // Same assessment is an idempotent durable record, not a new entry.
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

test("provider exit zero never validates a Goal without required evidence", async (t) => {
  const f = await failedSubmissionFixture(t, { budget: { maxCostUSD: 5 } });
  f.provider.exitCode = 0;
  const result = await f.worker.step();
  assert.equal(result.outcomes[0].submissionStatus, "COMPLETED");
  assert.equal(result.outcomes[0].goalLoop.decision, "BLOCKED_NEEDS_USER");
  assert.notEqual(result.outcomes[0].goalLoop.decision, "PASS");
  const decisions = await f.store.listGoalLoopDecisions({ submissionId: f.ack.submissionId });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].usage.totalCostUSD, null);
  assert.equal(f.provider.calls, 2);
  // No corrective dispatch is scheduled by read-only decision persistence.
  assert.equal((await f.worker.step()).claimed, 0);
  assert.equal(f.provider.calls, 2);
});

test("legacy numeric Goal decision usage stays readable while unknown is explicit", () => {
  const legacy = {
    id: "goal-legacy", schemaVersion: 1, submissionId: "sub-legacy",
    projectId: "project-legacy", planDigest: sha("plan"), artifactDigest: sha("artifact"),
    decision: "BLOCKED_NEEDS_USER", iteration: 1,
    failedTaskIds: [], affectedTaskIds: [], preservedTaskIds: [],
    usage: { iterations: 1, totalCostUSD: 0, elapsedMs: 1000 },
    createdAt: new Date().toISOString()
  };
  assert.equal(validateGoalLoopDecision(legacy).usage.totalCostUSD, 0);
  assert.equal(validateGoalLoopDecision({
    ...legacy, id: "goal-unknown", usage: { ...legacy.usage, totalCostUSD: null }
  }).usage.totalCostUSD, null);
});

test("stale and foreign evidence never covers an approved Goal criterion", async () => {
  const planDigest = sha("bound-plan");
  const taskId = "grade-ui";
  const approvedPlanTaskId = `exec-${planDigest.slice(0, 16)}-${taskId}`;
  const runId = "run-test-bound-01";
  const manifest = {
    planDigest, tasks: [{ taskId, dependsOn: [] }]
  };
  const store = {
    async getRun(id) {
      assert.equal(id, runId);
      return {
        id, taskId, status: "completed",
        metadata: {
          semanticTaskId: taskId,
          evidencePolicyVersion: 1,
          semanticTask: { id: taskId, acceptanceCriteria: ["note range checked"] },
          resolution: { outcome: { state: "validated" } }
        }
      };
    },
    async getTask(id) {
      assert.equal(id, approvedPlanTaskId);
      return { metadata: { semantic: {
        id: taskId, dependsOn: [], acceptanceCriteria: ["note range checked"]
      } } };
    },
    async listVerifications(filters) {
      assert.deepEqual(filters, { runId });
      return [{ id: "check-verified-01", runId, status: "passed", checks: [{ exitCode: 0 }] }];
    },
    async listEvidence() {
      return [
        // All have matching semantic text; only the immutable Run/Task/
        // verification associations may count toward completion.
        { runId: "run-from-old-revision", taskId,
          verificationId: "check-verified-01", acceptanceCriterion: "note range checked", content: "old proof" },
        { runId, taskId: "foreign-task",
          verificationId: "check-verified-01", acceptanceCriterion: "note range checked", content: "foreign proof" },
        { runId, taskId,
          verificationId: "older-check", acceptanceCriterion: "note range checked", content: "old check" }
      ];
    }
  };
  const { results } = await collectTaskResults({
    store, manifest, submission: { taskRuns: { [taskId]: runId } },
    taskOutcomes: { [taskId]: "completed" }
  });
  assert.deepEqual(results.get(taskId).evidence, []);
  assert.equal(results.get(taskId).resolutionState, "validated");
  // A receipt with the exact *runtime* semantic Task ID is accepted;
  // the namespaced approved-plan ID is only for immutable spec lookup.
  store.listEvidence = async () => [{
    runId, taskId, verificationId: "check-verified-01",
    acceptanceCriterion: "note range checked", content: "independent proof",
    producer: "DETERMINISTIC_VERIFIED", metadata: { provenance: "DETERMINISTIC_VERIFIED" }
  }];
  const correct = await collectTaskResults({
    store, manifest, submission: { taskRuns: { [taskId]: runId } },
    taskOutcomes: { [taskId]: "completed" }
  });
  assert.equal(correct.results.get(taskId).evidence.length, 1);
  store.listEvidence = async () => [{
    runId, taskId, verificationId: "check-verified-01",
    acceptanceCriterion: "note range checked", content: "agent says it is done",
    producer: "AGENT_REPORTED", metadata: { provenance: "AGENT_REPORTED" }
  }];
  const untrusted = await collectTaskResults({
    store, manifest, submission: { taskRuns: { [taskId]: runId } },
    taskOutcomes: { [taskId]: "completed" }
  });
  assert.deepEqual(untrusted.results.get(taskId).evidence, []);
  store.listVerifications = async () => [
    { id: "check-verified-01", runId, status: "passed" },
    { id: "check-duplicate-02", runId, status: "failed" }
  ];
  const ambiguous = await collectTaskResults({
    store, manifest, submission: { taskRuns: { [taskId]: runId } },
    taskOutcomes: { [taskId]: "completed" }
  });
  assert.equal(ambiguous.results.get(taskId).verification, null);
  assert.deepEqual(ambiguous.results.get(taskId).evidence, []);
});


test("terminal Goal decisions replay identically across concurrent assessments and later state changes", async (t) => {
  const { store, ack, worker } = await failedSubmissionFixture(t, { budget: { maxCostUSD: 5 } });
  const save = store.saveGoalLoopDecision.bind(store);
  store.saveGoalLoopDecision = async () => { throw new Error("assessment interrupted"); };
  const execution = await worker.step();
  assert.equal(execution.outcomes[0].goalLoop.decision, "ASSESSMENT_ERROR");
  store.saveGoalLoopDecision = save;
  assert.equal((await store.listGoalLoopDecisions({ submissionId: ack.submissionId })).length, 0);
  const competingStore = new JsonFileRunStore({ filePath: store.filePath });
  const competingSave = competingStore.saveGoalLoopDecision.bind(competingStore);
  let arrivals = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  function synchronize(saveDecision) {
    return async (record) => {
      if (++arrivals === 2) release();
      await barrier;
      return saveDecision(record);
    };
  }
  store.saveGoalLoopDecision = synchronize(save);
  competingStore.saveGoalLoopDecision = synchronize(competingSave);
  const concurrent = await Promise.all([
    assessSubmissionGoal({ store, submissionId: ack.submissionId, now: new Date("2030-01-01T00:00:00Z") }),
    assessSubmissionGoal({ store: competingStore, submissionId: ack.submissionId })
  ]);
  assert.equal(arrivals, 2);
  store.saveGoalLoopDecision = save;
  competingStore.saveGoalLoopDecision = competingSave;
  const first = concurrent[0];
  for (const replay of concurrent) {
    assert.deepEqual(replay.record, first.record);
    assert.deepEqual(replay.decision, first.decision);
  }
  await assert.rejects(competingStore.saveGoalLoopDecision({
    ...first.record,
    id: "goal-conflicting-verdict-01",
    decision: "PASS",
    reason: undefined
  }), { code: "GOAL_LOOP_DECISION_CONFLICT" });
  assert.equal((await store.listGoalLoopDecisions({ submissionId: ack.submissionId })).length, 1);
});

test("worker recovers missing terminal Goal decision without provider redispatch", async (t) => {
  const { store, ack, worker, provider } = await failedSubmissionFixture(t);
  const save = store.saveGoalLoopDecision.bind(store);
  store.saveGoalLoopDecision = async () => { throw new Error("temporary write failure"); };
  const first = await worker.step();
  assert.equal(first.outcomes[0].goalLoop.decision, "ASSESSMENT_ERROR");
  assert.equal((await store.listGoalLoopDecisions({ submissionId: ack.submissionId })).length, 0);
  store.saveGoalLoopDecision = save;
  const calls = provider.calls;
  assert.equal((await worker.step()).claimed, 0);
  assert.equal((await store.listGoalLoopDecisions({ submissionId: ack.submissionId })).length, 1);
  assert.equal(provider.calls, calls);
});

test("provider-reported cost makes a bounded corrective review auditable", async (t) => {
  const provider = new PricedOpenCode(1, 0.75);
  const { store, ack, worker } = await failedSubmissionFixture(t, {
    budget: { maxCostUSD: 5 }, provider
  });
  const result = await worker.step();
  assert.equal(result.outcomes[0].submissionStatus, "FAILED");
  assert.equal(result.outcomes[0].goalLoop.decision, "CORRECTIVE_REVIEW");
  const [record] = await store.listGoalLoopDecisions({ submissionId: ack.submissionId });
  assert.equal(record.usage.totalCostUSD, 0.75); // one dispatched task reported 0.75; the dependent task never ran
  assert.equal(record.usage.iterationCostUSD, 0.75);
  assert.equal(record.usage.costBasis, "provider-reported");
  // The corrective proposal is still never dispatched by the read-only step.
  assert.deepEqual([...record.affectedTaskIds], ["task-goal-front-001", "task-goal-integ-001"]);
  assert.equal((await worker.step()).claimed, 0);
});

test("unpriced tokens never become a number, and prior spend is added once", async (t) => {
  const { collectSubmissionCost } = require("../goal-loop-driver");
  const priced = {
    tool: "claude", provider: "anthropic", model: "claude-test",
    tokenInput: 1_000_000, tokenOutput: 0, usageComplete: true,
    costUSD: null, costSource: "unavailable"
  };
  const unpriced = { ...priced, usageComplete: false };
  const store = async (usage) => ({
    async listExecutions({ runId }) {
      assert.equal(runId, "run-goal-cost-01");
      return [{ metadata: { usage } }];
    }
  });
  const submission = { taskRuns: { "task-goal-front-001": "run-goal-cost-01" } };
  const pricing = require("../../telemetry/cost-estimator").validatePricing({
    schemaVersion: 1, currency: "USD", asOf: "2026-11-01", source: "fixture",
    models: { "anthropic/claude-test": { inputPerMillionUSD: 3, outputPerMillionUSD: 15 } }
  });

  // No provider-reported cost and no price table: unknown, never a guess.
  const unpricedTotal = await collectSubmissionCost({ store: await store(priced), submission, history: [] });
  assert.equal(unpricedTotal.currentUSD, null);
  assert.equal(unpricedTotal.totalCostUSD, null);
  assert.equal(unpricedTotal.reason, "PRICING_UNAVAILABLE");

  // With a price table the token math applies.
  const tableTotal = await collectSubmissionCost({ store: await store(priced), submission, history: [], pricing });
  assert.equal(tableTotal.currentUSD, 3);
  assert.equal(tableTotal.basis, "pricing-table");

  // Cumulative uses the latest iteration's cumulative value, never the sum of
  // every record (that would count previous spend twice).
  const history = [
    { iteration: 1, usage: { totalCostUSD: 2 } },
    { iteration: 3, usage: { totalCostUSD: 5 } },
    { iteration: 2, usage: { totalCostUSD: 4 } }
  ];
  const cumulative = await collectSubmissionCost({ store: await store(priced), submission, history, pricing });
  assert.equal(cumulative.totalCostUSD, 8);

  // A single unpriced invocation keeps the whole total unknown.
  const incomplete = await collectSubmissionCost({ store: await store(unpriced), submission, history, pricing });
  assert.equal(incomplete.currentUSD, null);
  assert.equal(incomplete.totalCostUSD, null);
  assert.equal(incomplete.reason, "USAGE_INCOMPLETE");
});

test("a per-iteration cost can never exceed the recorded cumulative total", () => {
  const record = {
    id: "goal-cost-coherence", schemaVersion: 1, submissionId: "sub-cost-01",
    projectId: "project-cost-01", planDigest: sha("plan"), artifactDigest: sha("artifact"),
    decision: "CORRECTIVE_REVIEW", iteration: 1,
    failedTaskIds: [], affectedTaskIds: [], preservedTaskIds: [],
    usage: { iterations: 1, totalCostUSD: 1, iterationCostUSD: 2, costBasis: "provider-reported", elapsedMs: 10 },
    createdAt: new Date().toISOString()
  };
  assert.throws(() => validateGoalLoopDecision(record), { code: "RUN_STORE_CORRUPTED" });
  assert.throws(() => validateGoalLoopDecision({
    ...record, usage: { ...record.usage, iterationCostUSD: 0.5, costBasis: 42 }
  }), { code: "RUN_STORE_CORRUPTED" });
  assert.equal(validateGoalLoopDecision({
    ...record, usage: { ...record.usage, iterationCostUSD: 0.5 }
  }).usage.iterationCostUSD, 0.5);
});
