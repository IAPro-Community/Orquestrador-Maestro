"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { resolveRecommendation } = require("../runtime/planner/recommendation-manager");
const { createIntentSpec, createIntentUnknown } = require("../runtime/planner/intent-spec");

test("resolveRecommendation with userAccepted=true converts to USER_DECISION and resolves unknown", () => {
  const spec = createIntentSpec("CRUD", {
    unknowns: [
      createIntentUnknown({ id: "u1", dimension: "arch", description: "d", reason: "r", blocking: true, status: "OPEN" })
    ]
  });

  const recommendation = {
    targetUnknown: "u1",
    recommendedValue: "REST",
    rationale: "r",
    impacts: [],
    evidence: []
  };

  const result = resolveRecommendation(spec, recommendation, true);

  assert.strictEqual(result.userDecisions.length, 1);
  assert.strictEqual(result.userDecisions[0], "Decided [arch]: REST");
  assert.strictEqual(result.unknowns[0].status, "RESOLVED");
});

test("resolveRecommendation with userAccepted=false leaves spec unchanged except maybe dismissing unknown", () => {
  const spec = createIntentSpec("CRUD", {
    unknowns: [
      createIntentUnknown({ id: "u1", dimension: "arch", description: "d", reason: "r", blocking: true, status: "OPEN" })
    ]
  });

  const recommendation = {
    targetUnknown: "u1",
    recommendedValue: "REST"
  };

  const result = resolveRecommendation(spec, recommendation, false);

  // No user decision
  assert.strictEqual(result.userDecisions.length, 0);
  // Unknown stays OPEN
  assert.strictEqual(result.unknowns[0].status, "OPEN");
});
