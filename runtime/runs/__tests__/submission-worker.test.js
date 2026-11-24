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

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

class FakeOpenCode {
  constructor() { this.id = "opencode"; this.calls = 0; }
  async detect() { return { id: this.id, installed: true, executable: "fake-opencode" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute() {
    this.calls++;
    return {
      pid: 10, cancel() {},
      result: Promise.resolve({
        providerId: this.id, pid: 10, exitCode: 0,
        stdout: "verified", stderr: "", durationMs: 1,
        cancelled: false, timedOut: false
      })
    };
  }
}

async function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-worker-e2e-"));
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
  await store.createProject({ id: "project-worker-001", path: projectRoot });
  const provider = new FakeOpenCode();
  const app = new MaestroApplication({
    projectRoot, store, providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  return { store, app, provider, projectRoot };
}

function submitParams(clientKey) {
  return {
    clientKey,
    artifact: {
      id: "artifact-worker-001", version: 1,
      content: "Worker fixture prompt with bounded length.",
      sha256: null
    },
    approvedModelUse: true,
    plan: {
      tasks: [{
        id: "task-worker-001", title: "Verify readme", objective: "Inspect the repository README",
        dependsOn: [], acceptanceCriteria: ["README inspected without changes"]
      }]
    },
    assignments: [{ taskId: "task-worker-001", providerId: "opencode", sandbox: "none" }],
    approval: { decision: "approved", approvedBy: "operator" }
  };
}

const sha = (value) => require("node:crypto").createHash("sha256").update(value).digest("hex");

test("worker executes one durable submission exactly once and reports its terminal state", async (t) => {
  const f = await fixture(t);
  const params = submitParams("submit-worker-key-001");
  params.artifact.sha256 = sha(params.artifact.content);
  const ack = await submitExecutablePlan({
    store: f.store, providers: new ProviderRegistry([f.provider]),
    projectRoot: f.projectRoot, workspacePath: f.projectRoot, params
  });
  assert.equal(ack.status, "PENDING_WORKER");

  const worker = createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-e2e-fixed-001", pollIntervalMs: 50
  });
  const first = await worker.step();
  assert.equal(first.claimed, 1);
  assert.equal(first.outcomes.length, 1);
  assert.equal(first.outcomes[0].submissionStatus, "COMPLETED");
  assert.equal(first.outcomes[0].runId, ack.submissionId ? first.outcomes[0].runId : null);
  assert.equal((await f.store.getRunSubmission(ack.submissionId)).status, "COMPLETED");
  assert.equal(f.provider.calls, 1);

  // An exhausted queue claims nothing; a second worker cannot replay.
  const second = await worker.step();
  assert.equal(second.claimed, 0);
  const workerTwo = createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-e2e-fixed-002", pollIntervalMs: 50
  });
  const raced = await workerTwo.step();
  assert.equal(raced.claimed, 0);
  assert.equal(f.provider.calls, 1);
});

test("worker loop drains new pending submissions and stops cleanly", async (t) => {
  const f = await fixture(t);
  const registry = new ProviderRegistry([f.provider]);
  const params = submitParams("submit-worker-loop-001");
  params.artifact.sha256 = sha(params.artifact.content);
  await submitExecutablePlan({
    store: f.store, providers: registry,
    projectRoot: f.projectRoot, workspacePath: f.projectRoot, params
  });
  const worker = createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-loop-fixed-01", pollIntervalMs: 50
  });
  let drained = 0;
  const deadline = Date.now() + 15000;
  while (drained === 0 && Date.now() < deadline) {
    const result = await worker.step();
    drained += result.claimed;
  }
  assert.equal(drained, 1);
  assert.equal((await f.store.getRunSubmission(
    (await f.store.listRunSubmissions())[0].id)).status, "COMPLETED");
  await worker.stop();
  assert.equal(worker.stopping, true);
  assert.equal(f.provider.calls, 1);
});

test("worker refuses an untrusted runtime or invalid options", async (t) => {
  const f = await fixture(t);
  assert.throws(() => createSubmissionWorker({
    application: {}, store: f.store, projectRoot: f.projectRoot, workerId: "worker-invalid-001"
  }), { code: "SUBMISSION_WORKER_UNAVAILABLE" });
  assert.throws(() => createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-invalid-001", concurrency: 9
  }), { code: "INVALID_SUBMISSION_WORKER" });
  assert.throws(() => createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "short", pollIntervalMs: 50
  }), { code: "INVALID_SUBMISSION" });
});

function dagParams(clientKey, { worktreePath } = {}) {
  return {
    clientKey,
    artifact: {
      id: "artifact-dag-001", version: 1,
      content: "DAG fixture prompt with bounded length.",
      sha256: null
    },
    approvedModelUse: true,
    plan: {
      tasks: [
        {
          id: "task-dag-front-001", title: "Frontend step", objective: "Implement the frontend part",
          dependsOn: [], acceptanceCriteria: ["frontend step finished"]
        },
        {
          id: "task-dag-integ-001", title: "Integration step", objective: "Integrate the frontend part",
          dependsOn: ["task-dag-front-001"], acceptanceCriteria: ["integration step finished"]
        }
      ]
    },
    assignments: [
      { taskId: "task-dag-front-001", providerId: "opencode", sandbox: "none", ...(worktreePath ? {} : {}) },
      { taskId: "task-dag-integ-001", providerId: "opencode", sandbox: "none" }
    ],
    approval: { decision: "approved", approvedBy: "operator" }
  };
}

test("dependent DAG tasks execute in order and failures block only descendants", async (t) => {
  const f = await fixture(t);
  const registry = new ProviderRegistry([f.provider]);
  const params = dagParams("submit-dag-key-0001");
  params.artifact.sha256 = sha(params.artifact.content);
  const ack = await submitExecutablePlan({
    store: f.store, providers: registry,
    projectRoot: f.projectRoot, workspacePath: f.projectRoot, params
  });
  const worker = createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-dag-fixed-0001", pollIntervalMs: 50
  });
  const result = await worker.step();
  assert.equal(result.claimed, 1);
  assert.deepEqual(result.outcomes[0].submissionStatus, "COMPLETED");
  assert.deepEqual(result.outcomes[0].taskOutcomes, {
    "task-dag-front-001": "completed", "task-dag-integ-001": "completed"
  });
  assert.equal(f.provider.calls, 2);
  assert.equal((await f.store.getRunSubmission(ack.submissionId)).status, "COMPLETED");
});

test("a failed task invalidates only its descendants and keeps the ledger consistent", async (t) => {
  const f = await fixture(t);
  f.provider.execute = async () => {
    f.provider.calls++;
    return {
      pid: 10, cancel() {},
      result: Promise.resolve({
        providerId: f.provider.id, pid: 10, exitCode: 1,
        stdout: "", stderr: "boom", durationMs: 1,
        cancelled: false, timedOut: false
      })
    };
  };
  const registry = new ProviderRegistry([f.provider]);
  const params = dagParams("submit-dag-fail-001");
  params.artifact.sha256 = sha(params.artifact.content);
  const ack = await submitExecutablePlan({
    store: f.store, providers: registry,
    projectRoot: f.projectRoot, workspacePath: f.projectRoot, params
  });
  const worker = createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-dag-fail-0001", pollIntervalMs: 50
  });
  const result = await worker.step();
  assert.equal(result.outcomes[0].submissionStatus, "FAILED");
  assert.deepEqual(result.outcomes[0].taskOutcomes, {
    "task-dag-front-001": "failed", "task-dag-integ-001": "blocked"
  });
  // Only the failed root task ever reached the provider.
  assert.equal(f.provider.calls, 1);
  assert.equal((await f.store.getRunSubmission(ack.submissionId)).status, "FAILED");
});

test("independent tasks reserve distinct worktrees atomically and execute in both", async (t) => {
  const f = await fixture(t);
  git(f.projectRoot, "worktree", "add", "-b", "feature-secondary", path.join(path.dirname(f.projectRoot), "secondary"));
  const secondary = path.join(path.dirname(f.projectRoot), "secondary");
  const registry = new ProviderRegistry([f.provider]);
  const params = dagParams("submit-dual-wt-key01");
  params.artifact.sha256 = sha(params.artifact.content);
  // Independent tasks on distinct worktrees; the integration task depends on
  // the frontend task but uses the secondary worktree.
  params.assignments = [
    { taskId: "task-dag-front-001", providerId: "opencode", sandbox: "none" },
    { taskId: "task-dag-integ-001", providerId: "opencode", sandbox: "none", worktreePath: secondary }
  ];
  const ack = await submitExecutablePlan({
    store: f.store, providers: registry,
    projectRoot: f.projectRoot, workspacePath: f.projectRoot, params
  });
  assert.equal(ack.status, "PENDING_WORKER");
  const row = await f.store.getRunSubmission(ack.submissionId);
  assert.equal(Object.keys(row.workspacePaths).length, 2);
  // Both worktrees are atomically reserved: a second submission on either
  // one must fail closed.
  const second = dagParams("submit-dual-wt-key02");
  second.artifact = { ...second.artifact, content: "second body", sha256: sha("second body") };
  await assert.rejects(submitExecutablePlan({
    store: f.store, providers: registry,
    projectRoot: f.projectRoot, workspacePath: secondary, params: second
  }), { code: "WORKSPACE_RESERVED" });
  const worker = createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-dual-wt-0001", pollIntervalMs: 50
  });
  const result = await worker.step();
  assert.equal(result.outcomes[0].submissionStatus, "COMPLETED");
  assert.equal(f.provider.calls, 2);
  assert.equal((await f.store.getRunSubmission(ack.submissionId)).status, "COMPLETED");
});


test("polling errors are sanitized and the worker recovers after a transient store failure", async (ctx) => {
  const f = await fixture(ctx);
  const list = f.store.listRunSubmissions.bind(f.store);
  let failOnce = true;
  f.store.listRunSubmissions = async (...args) => {
    if (failOnce) {
      failOnce = false;
      const error = new Error("Storage busy; token=ghp_ABCDEF12345678");
      error.code = "STORE_TEMPORARY_FAILURE";
      throw error;
    }
    return list(...args);
  };
  const reported = [];
  let sleepCalls = 0;
  let worker;
  worker = createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-recovery-log-001", pollIntervalMs: 50,
    onError: (event) => reported.push(event),
    sleep: async () => { if (++sleepCalls >= 2) await worker.stop(); }
  });
  await worker.run();
  assert.equal(reported.length, 1);
  assert.equal(reported[0].code, "STORE_TEMPORARY_FAILURE");
  assert.doesNotMatch(JSON.stringify(reported), /ghp_ABCDEF/);
  const d = worker.diagnostics();
  assert.equal(d.consecutivePollErrors, 0);
  assert.ok(d.lastSuccessfulPollAt);
  assert.equal(d.lastPollError.code, "STORE_TEMPORARY_FAILURE");
  assert.equal(d.stopping, true);
});

test("invalid worker diagnostics callback is rejected before processing", async (ctx) => {
  const f = await fixture(ctx);
  assert.throws(() => createSubmissionWorker({
    application: f.app, store: f.store, projectRoot: f.projectRoot,
    workerId: "worker-recovery-log-002", onError: "invalid"
  }), { code: "INVALID_SUBMISSION_WORKER" });
});
