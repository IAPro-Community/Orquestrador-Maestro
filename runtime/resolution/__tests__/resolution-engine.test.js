"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createResolution,
  finalizeResolution,
  resolutionProjection,
  deriveResolutionPolicy
} = require("..");

test("canonical resolution derives strategy from the existing cognitive budget", () => {
  const contract = createResolution({
    task: { id: "task-1", objective: "fix", acceptanceCriteria: [] },
    cognitiveBudget: { id: "LEAN", tier: "lean", contextTokens: 4000, maxIntelligentRetries: 0 },
    mode: "shadow"
  });
  assert.equal(contract.engine, "maestro-resolution-engine");
  assert.equal(contract.strategy, "targeted");
  assert.equal(contract.budget.contextTokens, 4000);
  assert.equal(contract.outcome.state, "pending");
});

test("completed tasks with explicit acceptance criteria need passed verification", () => {
  const contract = createResolution({
    task: { id: "task-1", objective: "fix", acceptanceCriteria: ["tests pass"] },
    cognitiveBudget: { id: "STANDARD", tier: "standard", contextTokens: 8000 }
  });
  const incomplete = finalizeResolution({
    contract,
    runStatus: "completed",
    verification: { status: "skipped" },
    completion: { eligible: true },
    review: { status: "disabled" }
  });
  assert.equal(incomplete.outcome.state, "needs_attention");

  const validated = finalizeResolution({
    contract,
    runStatus: "completed",
    verification: { status: "passed" },
    completion: { eligible: true },
    review: { status: "disabled" }
  });
  assert.equal(validated.outcome.state, "validated");
});

test("tasks without explicit validators may validate when verification is not applicable", () => {
  const contract = createResolution({
    task: { id: "task-1", objective: "inspect repository", acceptanceCriteria: [] },
    cognitiveBudget: { id: "LEAN", tier: "lean", contextTokens: 4000 }
  });
  const validated = finalizeResolution({
    contract,
    runStatus: "completed",
    verification: { status: "skipped" },
    completion: { eligible: true },
    review: { status: "disabled" }
  });
  assert.equal(validated.outcome.state, "validated");
});

test("enforce mode is fail-closed without an explicit promotion authorization", () => {
  assert.throws(() => deriveResolutionPolicy({
    cognitiveBudget: { id: "STANDARD", tier: "standard", contextTokens: 8000 },
    mode: "enforce"
  }), /RESOLUTION_ENFORCE_NOT_READY/u);
});

test("resolution projection never upgrades completed to validated without evidence", () => {
  assert.equal(resolutionProjection({ status: "completed", metadata: {} }).state, "needs_attention");
  assert.equal(resolutionProjection({
    status: "completed",
    metadata: { resolution: { outcome: { state: "validated" }, strategy: "balanced", mode: "shadow" } }
  }).state, "validated");
});
