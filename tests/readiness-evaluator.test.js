"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { evaluateReadiness } = require("../runtime/planner/readiness-evaluator");
const { createIntentSpec, createIntentUnknown } = require("../runtime/planner/intent-spec");

test("evaluateReadiness fails if there is an OPEN blocking unknown", () => {
  const spec = createIntentSpec("CRUD", {
    unknowns: [
      createIntentUnknown({ id: "1", dimension: "arch", description: "d", reason: "r", blocking: true, status: "OPEN" })
    ]
  });

  const result = evaluateReadiness(spec);
  assert.strictEqual(result.ready, false);
  assert.ok(result.blockers.length >= 1);
});

test("evaluateReadiness passes if blocking unknown is RESOLVED", () => {
  const spec = createIntentSpec("CRUD", {
    objective: "CRUD completo",
    requirements: ["A"],
    constraints: ["Node.js"], // Need some other dimensions to be considered ready
    unknowns: [
      createIntentUnknown({ id: "1", dimension: "arch", description: "d", reason: "r", blocking: true, status: "RESOLVED" })
    ]
  });

  const result = evaluateReadiness(spec);
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.blockers.length, 0);
});

test("evaluateReadiness fails if required dimension (objective) is missing", () => {
  const spec = createIntentSpec("", {
    objective: "", // Missing mandatory dimension
    unknowns: []
  });

  const result = evaluateReadiness(spec);
  assert.strictEqual(result.ready, false);
});

test("evaluateReadiness fails if objective is present but no other dimensions are satisfied (vague intent)", () => {
  const spec = createIntentSpec("crud", {
    objective: "crud",
    requirements: [],
    constraints: [],
    unknowns: []
  });

  const result = evaluateReadiness(spec);
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.blockers.some(b => b.type === "INCOMPLETE_DIMENSIONS"), true);
});

test("evaluateReadiness passes if objective and sufficient dimensions are satisfied without blockers", () => {
  const spec = createIntentSpec("crud", {
    objective: "Create product CRUD",
    requirements: ["Authentication", "Product list"],
    constraints: ["React", "Node.js"],
    unknowns: []
  });

  const result = evaluateReadiness(spec);
  assert.strictEqual(result.ready, true);
});
