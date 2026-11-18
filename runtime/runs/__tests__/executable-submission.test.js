"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { JsonFileRunStore } = require("../../store");
const {
  canonicalPlanDigest, approvedTaskContent, buildApprovalReceipt, validateApprovalReceipt,
  createTrustedApprovalVerifier, createApprovedTaskResolver, submitExecutablePlan
} = require("../executable-submission");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}
function init(root) {
  fs.mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", "user.email", "example@example.invalid");
  git(root, "config", "user.name", "fixture");
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-qm", "initial");
}
function planFixture() {
  return {
    tasks: [
      {
        id: "frontend-001", title: "Build the panel", objective: "Implement the panel component",
        dependsOn: [], acceptanceCriteria: ["component renders", "tests pass"]
      },
      {
        id: "integration-001", title: "Integrate", objective: "Wire the panel into the page",
        dependsOn: ["frontend-001"], acceptanceCriteria: ["page builds"]
      }
    ]
  };
}
function registry(caps = {}) {
  const adapters = new Map([
    ["agy", { id: "agy", capabilities: async () => ({ sandboxControl: true, ...caps }) }],
    ["codex", { id: "codex", capabilities: async () => ({ sandboxControl: true, ...caps }) }],
    ["opencode", { id: "opencode", capabilities: async () => ({ sandboxControl: false, ...caps }) }],
    ["claude", { id: "claude", capabilities: async () => ({ sandboxControl: false, ...caps }) }]
  ]);
  return { get: (id) => adapters.get(id) || null };
}
function submitParams(patch = {}) {
  return {
    clientKey: "submit-fixture-key-001",
    artifact: { id: "artifact-fixture-001", version: 1, content: "approved prompt body", sha256: null },
    approvedModelUse: true,
    plan: planFixture(),
    assignments: [
      { taskId: "frontend-001", providerId: "agy", sandbox: "enabled" },
      { taskId: "integration-001", providerId: "opencode", sandbox: "none" }
    ],
    approval: { decision: "approved", approvedBy: "operator" },
    ...patch
  };
}
function artifactFor(params) {
  return { ...params.artifact, sha256: require("node:crypto").createHash("sha256").update(params.artifact.content).digest("hex") };
}

test("plan digest is stable and task content digests are bound to the approved text", () => {
  const tasks = planFixture().tasks.map((task) => ({ ...task, dependsOn: [...task.dependsOn], acceptanceCriteria: [...task.acceptanceCriteria] }));
  assert.equal(canonicalPlanDigest(tasks), canonicalPlanDigest(JSON.parse(JSON.stringify(tasks))));
  const content = approvedTaskContent(tasks[0]);
  assert.equal(content.description, "Build the panel: Implement the panel component");
  assert.equal(content.acceptanceText, "component renders\ntests pass");
});

test("approval receipts are self-verifying and reject forged ids", () => {
  const manifest = {
    id: "manifest-" + "a".repeat(64), digest: "a".repeat(64),
    projectId: "project-submit-001", planDigest: "b".repeat(64), artifactDigest: "c".repeat(64),
    tasks: [{ taskId: "task-001", promptDigest: "d".repeat(64), acceptanceDigest: "e".repeat(64) }]
  };
  const receipt = buildApprovalReceipt({ projectId: manifest.projectId, manifest, approvedAt: "2026-11-18T12:00:00.000Z" });
  assert.match(receipt.id, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateApprovalReceipt(receipt), receipt);
  assert.throws(() => validateApprovalReceipt({ ...receipt, id: "f".repeat(64) }), /digest mismatch/);
  assert.throws(() => validateApprovalReceipt({ ...receipt, decision: "rejected" }), /malformed approval receipt payload/);
  assert.throws(() => validateApprovalReceipt({ ...receipt, tasks: [...receipt.tasks, { taskId: "task-002", promptDigest: "1".repeat(64), acceptanceDigest: "2".repeat(64) }] }), /digest mismatch/);
});

test("trusted approval verifier only accepts the exact bound manifest", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-submit-verifier-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.initialize();
  const manifest = {
    id: "manifest-" + "a".repeat(64), digest: "a".repeat(64),
    projectId: "project-submit-001", planDigest: "b".repeat(64), artifactDigest: "c".repeat(64),
    tasks: [{ taskId: "task-001", promptDigest: "d".repeat(64), acceptanceDigest: "e".repeat(64) }]
  };
  const receipt = buildApprovalReceipt({ projectId: manifest.projectId, manifest, approvedAt: "2026-11-18T12:00:00.000Z" });
  const verify = createTrustedApprovalVerifier({ store });
  assert.equal(await verify({ manifestId: manifest.id, approvalDigest: receipt.id }), false);
  await store.createProject({ id: manifest.projectId, path: tmp });
  await store.saveApprovalReceipt(receipt);
  assert.equal(await verify({
    manifestId: manifest.id, manifestDigest: manifest.digest,
    planDigest: manifest.planDigest, artifactDigest: manifest.artifactDigest,
    projectId: manifest.projectId, approvalDigest: receipt.id
  }), true);
  assert.equal(await verify({
    manifestId: manifest.id, manifestDigest: "9".repeat(64),
    planDigest: manifest.planDigest, artifactDigest: manifest.artifactDigest,
    projectId: manifest.projectId, approvalDigest: receipt.id
  }), false);
  // Non-canonical metadata may differ on a replayed approval; the digest
  // still resolves to the same immutable receipt.
  const replayed = await store.saveApprovalReceipt({
    ...receipt, approvedAt: "2026-11-18T13:30:00.000Z", approvedBy: "second-operator"
  });
  assert.equal(replayed.id, receipt.id);
  assert.equal(replayed.approvedAt, receipt.approvedAt);
});

test("durable submission admits a fenced entry bound to a persisted approval receipt", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-submit-e2e-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, "root");
  init(root);
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.initialize();
  await store.createProject({ id: "project-submit-001", path: root });

  const params = { ...submitParams(), artifact: artifactFor(submitParams()) };
  const ack = await submitExecutablePlan({
    store, providers: registry(), projectRoot: root, workspacePath: root, params
  });
  assert.equal(ack.status, "PENDING_WORKER");
  assert.equal(ack.replayed, false);
  assert.match(ack.submissionId, /^submission-/);
  assert.match(ack.manifestId, /^manifest-[a-f0-9]{64}$/);
  assert.match(ack.approvalDigest, /^[a-f0-9]{64}$/);

  // Persisted content is uniquely resolvable by the production dispatch resolver.
  const resolve = createApprovedTaskResolver({ store });
  const manifest = await store.getExecutableManifest(ack.manifestId);
  const task = manifest.tasks.find((item) => item.taskId === "frontend-001");
  const content = await resolve({
    manifestId: ack.manifestId, manifestDigest: manifest.digest,
    taskId: task.taskId, promptDigest: task.promptDigest, acceptanceDigest: task.acceptanceDigest
  });
  assert.equal(content.description, "Build the panel: Implement the panel component");
  await assert.rejects(resolve({
    manifestId: ack.manifestId, manifestDigest: manifest.digest,
    taskId: "forged-0001", promptDigest: task.promptDigest, acceptanceDigest: task.acceptanceDigest
  }), { code: "EXECUTABLE_ARTIFACT_MISMATCH" });

  // Idempotent replay; conflicting digest fails closed.
  const replay = await submitExecutablePlan({
    store, providers: registry(), projectRoot: root, workspacePath: root,
    params: { ...params, approval: { decision: "approved", approvedBy: "operator" } }
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.submissionId, ack.submissionId);
  const conflict = submitParams();
  conflict.artifact = artifactFor({ artifact: { ...submitParams().artifact, content: "different approved body" } });
  await assert.rejects(submitExecutablePlan({
    store, providers: registry(), projectRoot: root, workspacePath: root,
    params: { ...conflict, clientKey: "submit-fixture-key-002" }
  }), { code: "WORKSPACE_RESERVED" });
});

test("submission fails closed without approval, consent, capability or workspace match", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-submit-negative-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, "root");
  init(root);
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.initialize();
  await store.createProject({ id: "project-submit-001", path: root });
  const base = { store, providers: registry(), projectRoot: root, workspacePath: root };

  const noConsent = { ...submitParams(), artifact: artifactFor(submitParams()), approvedModelUse: false };
  await assert.rejects(submitExecutablePlan({ ...base, params: noConsent }), { code: "MODEL_USE_NOT_APPROVED" });

  const noApproval = { ...submitParams(), artifact: artifactFor(submitParams()), approval: { decision: "deferred" } };
  await assert.rejects(submitExecutablePlan({ ...base, params: noApproval }), { code: "APPROVAL_NOT_VERIFIED" });

  const badDigest = { ...submitParams(), artifact: { ...artifactFor(submitParams()), sha256: "0".repeat(64) } };
  await assert.rejects(submitExecutablePlan({ ...base, params: badDigest }),
    /artifact.sha256 does not match/);

  const badSandbox = submitParams();
  badSandbox.artifact = artifactFor(submitParams());
  badSandbox.assignments = [
    { taskId: "frontend-001", providerId: "opencode", sandbox: "enabled" },
    { taskId: "integration-001", providerId: "opencode", sandbox: "none" }
  ];
  await assert.rejects(submitExecutablePlan({ ...base, params: badSandbox }), { code: "SANDBOX_NOT_SUPPORTED" });

  const badPlan = submitParams();
  badPlan.artifact = artifactFor(submitParams());
  badPlan.plan.tasks[1].dependsOn = ["missing-task-00"];
  await assert.rejects(submitExecutablePlan({ ...base, params: badPlan }), { code: "PLAN_NOT_EXECUTABLE" });

  const staleWorkspace = { ...submitParams(), artifact: artifactFor(submitParams()) };
  git(root, "checkout", "-qb", "feature-submit");
  fs.writeFileSync(path.join(root, "feature.txt"), "work\n");
  git(root, "add", "feature.txt");
  git(root, "commit", "-qm", "feature head");
  const first = await submitExecutablePlan({ ...base, params: staleWorkspace });
  assert.equal(first.branch, "feature-submit");
  // A second submission on the same reserved workspace must fail closed.
  const second = { ...submitParams(), artifact: artifactFor(submitParams()), clientKey: "submit-second-key-001" };
  await assert.rejects(submitExecutablePlan({ ...base, params: second }), { code: "WORKSPACE_RESERVED" });
  assert.equal((await store.listRunSubmissions()).length, 1);
});
