"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectProviderGoal, selectGoalExecution, GOAL_CONTROLS } = require("../goal-preflight");

function adapter({ id = "codex", installed = true, version = "codex-cli 0.167.0",
  headless = true } = {}) {
  return {
    id,
    async detect() { return { id, installed, version }; },
    async capabilities() { return { headless, structuredEvents: true }; }
  };
}

test("interactive /goal availability never authorizes headless lifecycle", async () => {
  for (const id of ["codex", "claude", "opencode"]) {
    const preflight = await inspectProviderGoal(adapter({ id }));
    assert.equal(preflight.ordinaryHeadlessExecution, true);
    assert.equal(preflight.nativeGoalController, "unsupported");
    assert.equal(preflight.nativeOvernightReady, false);
    assert.deepEqual(Object.keys(preflight.goalCapabilities), [...GOAL_CONTROLS]);
    for (const field of GOAL_CONTROLS) assert.equal(preflight.goalCapabilities[field], "unknown");
    for (const approvedFallback of [false, true]) {
      const selected = selectGoalExecution(preflight, {
        autonomousExecution: true, approvedFallback
      });
      assert.equal(selected.dispatchAllowed, false);
      assert.equal(selected.selectedOwner, null);
    }
  }
});

test("unavailable executable, unknown version and disabled flag fail closed", async () => {
  const noVersion = await inspectProviderGoal(adapter({ version: "" }));
  assert.equal(noVersion.reason, "PROVIDER_VERSION_UNVERIFIED");
  const missing = await inspectProviderGoal(adapter({ installed: false }));
  assert.equal(missing.reason, "PROVIDER_NOT_INSTALLED");
  assert.equal(selectGoalExecution(missing, { autonomousExecution: true }).reason, "PROVIDER_NOT_INSTALLED");
  assert.equal(selectGoalExecution(noVersion).reason, "GOAL_AUTONOMY_DISABLED");
  assert.equal(selectGoalExecution(noVersion, {
    requestedOwner: "maestro-managed", autonomousExecution: true
  }).reason, "MANAGED_GOAL_LOOP_NOT_CERTIFIED");
});

test("detection errors and invalid surfaces never become capabilities", async () => {
  const provider = {
    id: "codex",
    async detect() { throw new Error("private auth data"); },
    async capabilities() { throw new Error("not connected"); }
  };
  const preflight = await inspectProviderGoal(provider);
  assert.equal(preflight.installed, false);
  assert.equal(preflight.nativeOvernightReady, false);
  assert.equal(preflight.reason, "PROVIDER_NOT_INSTALLED");
  assert.throws(() => selectGoalExecution(preflight, { requestedOwner: "other" }), TypeError);
  await assert.rejects(inspectProviderGoal(provider, { surface: "unsupported" }), TypeError);
});

test("native Goal prompt observation is not a lifecycle capability", () => {
  const { observesNativeGoalCommand } = require("../goal-preflight");
  for (const prompt of ["/goal", "/goal status", "  /goal\nimplement"]) {
    assert.equal(observesNativeGoalCommand(prompt), true);
  }
  for (const prompt of [null, undefined, {}, "/goals", "/goal-loop", "use /goal to implement", " `/goal`"]) {
    assert.equal(observesNativeGoalCommand(prompt), false);
  }
});
