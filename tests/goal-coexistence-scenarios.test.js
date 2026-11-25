"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { capabilities } = require("../runtime/core");
const { MaestroApplication, ProviderRegistry } = require("../runtime/application/maestro-application");
const { JsonFileRunStore } = require("../runtime/store");
const { submitExecutablePlan } = require("../runtime/runs/executable-submission");
const { createSubmissionWorker } = require("../runtime/runs/submission-worker");
const { reconcileExpiredRunAdmissions } = require("../runtime/runs/reconciliation");
const { assessSubmissionGoal } = require("../runtime/runs/goal-loop-driver");
const { assessGoalCorrection } = require("../runtime/runs/goal-loop-policy");
const { inspectProviderGoal, selectGoalExecution } = require("../runtime/providers/goal-preflight");
const { observeHarnessEvent, evaluateContinuationAuthority } = require("../runtime/integrations/harness/contract");
const { handleOpenAIHookEvent } = require("../runtime/integrations/openai/adapter");

const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

function makeRepo(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-coexist-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const projectRoot = path.join(tmp, "repo");
  fs.mkdirSync(projectRoot);
  git(projectRoot, "init", "-q");
  git(projectRoot, "config", "user.name", "Fixture");
  git(projectRoot, "config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Fixture\n");
  git(projectRoot, "add", ".");
  git(projectRoot, "commit", "-qm", "init");
  return { tmp, projectRoot };
}

function makeProvider({ id = "codex", installed = true, exitCode = 0, timedOut = false, cancelled = false, cost = null, callsOut = null } = {}) {
  return {
    id,
    async detect() { return { id, installed, version: installed ? "0.172.0" : null }; },
    async capabilities() { return capabilities({ headless: installed, streaming: installed }); },
    async execute() {
      if (callsOut) callsOut.count += 1;
      const stdout = cost === null ? "done" : [
        JSON.stringify({ type: "step_start", sessionID: "s-1", modelID: "m-1", providerID: id }),
        JSON.stringify({ type: "step_finish", sessionID: "s-1", part: { tokens: { input: 100, output: 20 }, cost } })
      ].join("\n");
      return {
        pid: 4242,
        cancel() {},
        result: Promise.resolve({
          providerId: id, pid: 4242, exitCode, stdout, stderr: exitCode === 0 ? "" : "fail",
          durationMs: 5, cancelled, timedOut
        })
      };
    }
  };
}

test("Phase 5: all 12 continuity & failure edge cases preserve single owner and fail closed", async (t) => {
  const { tmp, projectRoot } = makeRepo(t);
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "runs.json") });
  await store.initialize();
  await store.createProject({ id: "project-coexist-12", path: projectRoot });

  // 1. Harness with native Goal active -> host owns continuity, Maestro blocks competing loop
  const s1 = evaluateContinuationAuthority({
    host: "codex", surface: "tui", installed: true, version: "0.172.0",
    nativeGoalActive: true, requestedOwner: "maestro-managed", managedAuthorized: true, managedCertified: true
  });
  assert.equal(s1.owner, "native-provider");
  assert.equal(s1.competingLoopBlocked, true);
  assert.equal(s1.dispatchAllowed, false);

  // 2. Harness without native Goal -> managed blocked unless BOTH authorized & certified
  const s2 = evaluateContinuationAuthority({
    host: "gemini", surface: "cli", installed: true, version: "0.57.0",
    nativeGoalObserved: false, nativeGoalActive: false, requestedOwner: "maestro-managed",
    managedAuthorized: true, managedCertified: false
  });
  assert.equal(s2.owner, null);
  assert.equal(s2.reason, "MANAGED_GOAL_LOOP_NOT_CERTIFIED");

  // 3. Goal interrupted (TIMED_OUT) -> stays terminal/blocked without blind retry
  const timedProvider = makeProvider({ id: "opencode", exitCode: 1, timedOut: true, cost: 0.25 });
  const app = new MaestroApplication({ projectRoot, store, providers: new ProviderRegistry([timedProvider]), skills: { get: () => null } });
  const content3 = "Interrupted goal test prompt";
  const ack3 = await submitExecutablePlan({
    store, providers: new ProviderRegistry([timedProvider]), projectRoot, workspacePath: projectRoot,
    params: {
      clientKey: "key-interrupted-0001",
      artifact: { id: "art-3", version: 1, content: content3, sha256: sha(content3) },
      approvedModelUse: true,
      plan: { tasks: [{ id: "task-timeout-01", title: "Timeout task", objective: "Execute timed out command", dependsOn: [], acceptanceCriteria: ["timeout state recorded cleanly"] }] },
      assignments: [{ taskId: "task-timeout-01", providerId: "opencode", sandbox: "none" }],
      approval: { decision: "approved", approvedBy: "op" },
      budget: { maxCostUSD: 5 }
    }
  });
  const worker = createSubmissionWorker({ application: app, store, projectRoot, workerId: "worker-coexist-12", pollIntervalMs: 50 });
  const r3 = await worker.step();
  assert.equal(r3.outcomes[0].submissionStatus, "TIMED_OUT");
  assert.equal(r3.outcomes[0].goalLoop.decision, "CORRECTIVE_REVIEW");
  assert.deepEqual(r3.outcomes[0].goalLoop.affectedTaskIds, ["task-timeout-01"]);

  // 4. Goal cancelled before dispatch -> terminal CANCELLED, goal assessor refuses auto-recovery
  const content4 = "Cancelled goal test prompt";
  const ack4 = await submitExecutablePlan({
    store, providers: new ProviderRegistry([timedProvider]), projectRoot, workspacePath: projectRoot,
    params: {
      clientKey: "key-cancelled-0001",
      artifact: { id: "art-4", version: 1, content: content4, sha256: sha(content4) },
      approvedModelUse: true,
      plan: { tasks: [{ id: "task-cancel-01", title: "Cancelled task", objective: "Execute cancellable command", dependsOn: [], acceptanceCriteria: ["cancelled submission stays terminal"] }] },
      assignments: [{ taskId: "task-cancel-01", providerId: "opencode", sandbox: "none" }],
      approval: { decision: "approved", approvedBy: "op" }
    }
  });
  const cancelled = await store.requestRunSubmissionCancellation(ack4.submissionId);
  assert.equal(cancelled.status, "CANCELLED");
  const r4 = await worker.step();
  assert.equal(r4.claimed, 0);
  await assert.rejects(assessSubmissionGoal({ store, submissionId: ack4.submissionId }), { code: "GOAL_LOOP_INVALID_STATE" });

  // 5. Resumed / replayed terminal decision -> immutable idempotent replay
  const replay = await assessSubmissionGoal({ store, submissionId: ack3.submissionId });
  assert.equal(replay.decision.decision, r3.outcomes[0].goalLoop.decision);
  assert.equal(replay.decision.executionEnabled, false);
  assert.equal(replay.decision.requiresApproval, true);

  // 6. Session ended (Stop / AfterAgent / SessionEnd) -> never certifies Goal completion
  const stopObs = observeHarnessEvent("claude", { hook_event_name: "Stop", session_id: "s-6" }, { surface: "cli" });
  const endObs = observeHarnessEvent("claude", { hook_event_name: "SessionEnd", session_id: "s-6" }, { surface: "cli" });
  assert.equal(stopObs.goalState, "unknown");
  assert.equal(endObs.goalState, "unknown");
  assert.equal(endObs.dispatchAllowed, false);

  // 7. Unknown authority -> fails closed
  const s7 = evaluateContinuationAuthority({ host: "unknown", surface: "unknown", installed: true, version: "1.0.0" });
  assert.equal(s7.owner, null);
  assert.equal(s7.dispatchAllowed, false);

  // 8 & 9 & 10. Verification failure + Repeated failure limit + Budget exhausted + Unknown cost null
  const task = { id: "t-1", title: "T1", objective: "Obj", dependsOn: [], acceptanceCriteria: ["unit tests pass"] };
  const fp = sha("same-fail");
  const baseResults = new Map([["t-1", { status: "failed", error: "tests failed", verification: { status: "failed" } }]]);
  assert.equal(assessGoalCorrection({
    tasks: [task], results: baseResults, planDigest: "a".repeat(64),
    limits: { maxIterations: 3, maxRepeatSameFailure: 2, maxTotalCostUSD: 5, maxDurationMs: 60000 },
    usage: { iterations: 1, totalCostUSD: null, elapsedMs: 10 },
    history: [], failureFingerprints: { "t-1": fp }
  }).reason, "COST_USAGE_UNAVAILABLE");

  assert.equal(assessGoalCorrection({
    tasks: [task], results: baseResults, planDigest: "a".repeat(64),
    limits: { maxIterations: 3, maxRepeatSameFailure: 2, maxTotalCostUSD: 5, maxDurationMs: 60000 },
    usage: { iterations: 1, totalCostUSD: 5.01, elapsedMs: 10 },
    history: [], failureFingerprints: { "t-1": fp }
  }).reason, "COST_BUDGET_EXHAUSTED");

  assert.equal(assessGoalCorrection({
    tasks: [task], results: baseResults, planDigest: "a".repeat(64),
    limits: { maxIterations: 3, maxRepeatSameFailure: 2, maxTotalCostUSD: 10, maxDurationMs: 60000 },
    usage: { iterations: 3, totalCostUSD: 2, elapsedMs: 10 },
    history: [{ taskId: "t-1", failureFingerprint: fp }, { taskId: "t-1", failureFingerprint: fp }],
    failureFingerprints: { "t-1": fp }
  }).reason, "ITERATION_BUDGET_EXHAUSTED");

  assert.equal(assessGoalCorrection({
    tasks: [task], results: baseResults, planDigest: "a".repeat(64),
    limits: { maxIterations: 5, maxRepeatSameFailure: 2, maxTotalCostUSD: 10, maxDurationMs: 60000 },
    usage: { iterations: 3, totalCostUSD: 2, elapsedMs: 10 },
    history: [{ taskId: "t-1", failureFingerprint: fp }, { taskId: "t-1", failureFingerprint: fp }],
    failureFingerprints: { "t-1": fp }
  }).reason, "REPEATED_FAILURE_LIMIT");

  // 11. Provider unavailable -> preflight fails closed
  const unavailable = await inspectProviderGoal(makeProvider({ id: "codex", installed: false }));
  assert.equal(selectGoalExecution(unavailable, { autonomousExecution: true }).reason, "PROVIDER_NOT_INSTALLED");

  // 12. Crash / expired claim during execution -> quarantined to RECONCILIATION_REQUIRED, never blindly replayed
  const content12 = "Stale claim recovery prompt";
  const ack12 = await submitExecutablePlan({
    store, providers: new ProviderRegistry([timedProvider]), projectRoot, workspacePath: projectRoot,
    params: {
      clientKey: "key-crash-stale-0001",
      artifact: { id: "art-12", version: 1, content: content12, sha256: sha(content12) },
      approvedModelUse: true,
      plan: { tasks: [{ id: "task-crash-01", title: "Stale claim task", objective: "Simulate stale worker lease", dependsOn: [], acceptanceCriteria: ["quarantined before any replay"] }] },
      assignments: [{ taskId: "task-crash-01", providerId: "opencode", sandbox: "none" }],
      approval: { decision: "approved", approvedBy: "op" }
    }
  });
  await store.claimRunSubmission(ack12.submissionId, { workerId: "dead-worker", leaseMs: 1000 });
  await new Promise((r) => setTimeout(r, 1050));
  const rec = await reconcileExpiredRunAdmissions({ store, apply: true });
  assert.equal(rec.safeToRedispatch, false);
  assert.equal((await store.getRunSubmission(ack12.submissionId)).status, "RECONCILIATION_REQUIRED");
  const afterQuarantine = await worker.step();
  assert.equal(afterQuarantine.claimed, 0);
});

test("Phase 7 Scenarios A, B, C, D: conventional flow, /goal coexistence, non-goal fail-closed, and overnight multi-task DAG", async (t) => {
  const { tmp, projectRoot } = makeRepo(t);
  const pluginData = path.join(tmp, "plugin-data");

  // Scenario A: Conventional request -> bounded policy, no nativeGoalCommandObserved, single-turn guidance
  const conv = handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "sess-a",
    turn_id: "turn-a1",
    cwd: projectRoot,
    prompt: "Crie uma tela de lancamento de notas seguindo os padroes do projeto."
  }, { pluginData, route: () => ({ complexity: { level: "STANDARD", budget: { maxContextTokens: 8000, allowSubagents: false } }, profile: "standard", allSkills: [{ id: "skill-frontend-excellence" }] }) });
  assert.match(conv.hookSpecificOutput.additionalContext, /Maestro policy/);
  assert.doesNotMatch(conv.hookSpecificOutput.additionalContext, /Native Goal command observed/);

  // Scenario B: /goal native -> host preserves continuity, no competing loop, Stop never certifies completion
  const nativePrompt = handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "sess-b",
    turn_id: "turn-b1",
    cwd: projectRoot,
    prompt: "/goal Crie uma tela de lancamento de notas e valide todos os requisitos."
  }, { pluginData, route: () => ({ complexity: { level: "COMPLEX", budget: { maxContextTokens: 16000, allowSubagents: true } }, profile: "complex", allSkills: [] }) });
  assert.match(nativePrompt.hookSpecificOutput.additionalContext, /Preserve the host's continuation; do not launch a competing loop/);
  assert.deepEqual(handleOpenAIHookEvent({ hook_event_name: "Stop", session_id: "sess-b", turn_id: "turn-b1", cwd: projectRoot }, { pluginData }), {});

  // Scenario C: Harness without native Goal -> cannot self-authorize unattended loop
  const gemPreflight = await inspectProviderGoal(makeProvider({ id: "gemini", installed: true }), { surface: "cli" });
  const gemChoice = selectGoalExecution(gemPreflight, { requestedOwner: "maestro-managed", autonomousExecution: false });
  assert.equal(gemChoice.dispatchAllowed, false);
  assert.equal(gemChoice.reason, "GOAL_AUTONOMY_DISABLED");

  // Scenario D: Overnight multi-task DAG with dependencies, cost accumulation, no duplicate task execution
  const store = new JsonFileRunStore({ filePath: path.join(tmp, "overnight.json") });
  await store.initialize();
  await store.createProject({ id: "proj-overnight", path: projectRoot });
  const calls = { count: 0 };
  const provider = makeProvider({ id: "opencode", exitCode: 0, cost: 0.5, callsOut: calls });
  const app = new MaestroApplication({ projectRoot, store, providers: new ProviderRegistry([provider]), skills: { get: () => null } });
  const spec = "Overnight grade entry screen multi-step plan";
  const ack = await submitExecutablePlan({
    store, providers: new ProviderRegistry([provider]), projectRoot, workspacePath: projectRoot,
    params: {
      clientKey: "overnight-dag-key-0001",
      artifact: { id: "art-overnight", version: 1, content: spec, sha256: sha(spec) },
      approvedModelUse: true,
      plan: {
        tasks: [
          { id: "task-discover", title: "Discover UI patterns", objective: "Inspect existing repository patterns", dependsOn: [], acceptanceCriteria: ["existing components catalogued"] },
          { id: "task-implement", title: "Implement grade UI", objective: "Build grade entry UI following patterns", dependsOn: ["task-discover"], acceptanceCriteria: ["component unit tests pass"] },
          { id: "task-verify", title: "Verify UI delivery", objective: "Run independent verification suite", dependsOn: ["task-implement"], acceptanceCriteria: ["verification suite green"] }
        ]
      },
      assignments: [
        { taskId: "task-discover", providerId: "opencode", sandbox: "none" },
        { taskId: "task-implement", providerId: "opencode", sandbox: "none" },
        { taskId: "task-verify", providerId: "opencode", sandbox: "none" }
      ],
      approval: { decision: "approved", approvedBy: "operator" },
      budget: { maxCostUSD: 10 }
    }
  });
  const worker = createSubmissionWorker({ application: app, store, projectRoot, workerId: "wrk-overnight", pollIntervalMs: 50 });
  const step1 = await worker.step();
  const step2 = await worker.step(); // No duplicate execution on subsequent worker poll!
  assert.equal(calls.count, 3);
  assert.equal(step1.outcomes[0].submissionStatus, "COMPLETED");
  assert.equal(step2.claimed, 0);
  const storedDecisions = await store.listGoalLoopDecisions({ submissionId: ack.submissionId });
  assert.equal(storedDecisions.length, 1);
  assert.equal(storedDecisions[0].usage.totalCostUSD, 1.5);
  // Completion without DETERMINISTIC_VERIFIED evidence stays BLOCKED_NEEDS_USER, never false PASS
  assert.equal(storedDecisions[0].decision, "BLOCKED_NEEDS_USER");
});
