"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  classifyResolutionFailure,
  shouldEscalateContext,
  shouldSwitchProvider,
  nextResolutionStrategy
} = require("..");

test("only context-related validation failures buy more context", () => {
  const contextFailure = classifyResolutionFailure({
    code: "STRUCTURED_OUTPUT_FAILED",
    failureKind: "validation",
    blockerCodes: ["CONTEXT_FACT_CONTRADICTION"]
  });
  const deterministicFailure = classifyResolutionFailure({
    code: "STRUCTURED_OUTPUT_FAILED",
    failureKind: "validation",
    blockerCodes: ["INVALID_DEPENDENCY"]
  });
  assert.equal(contextFailure, "insufficient-context");
  assert.equal(shouldEscalateContext(contextFailure), true);
  assert.equal(deterministicFailure, "validation-failure");
  assert.equal(shouldEscalateContext(deterministicFailure), false);
});

test("provider failures switch provider rather than escalating reasoning", () => {
  const reason = classifyResolutionFailure({ code: "PROVIDER_EXECUTION_FAILED", failureKind: "provider" });
  assert.equal(reason, "provider-failure");
  assert.equal(shouldSwitchProvider(reason), true);
  assert.equal(shouldEscalateContext(reason), false);
});

test("strategy escalation is finite", () => {
  assert.equal(nextResolutionStrategy("targeted"), "balanced");
  assert.equal(nextResolutionStrategy("balanced"), "deep");
  assert.equal(nextResolutionStrategy("deep"), null);
});
