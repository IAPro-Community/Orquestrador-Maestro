"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { validateProposal, applyProposal } = require("../runtime/planner/proposal-validator");
const { createIntentSpec } = require("../runtime/planner/intent-spec");

test("validateProposal suppresses redundant questions", () => {
  const proposal = {
    question: {
      dimension: "architecture",
      text: "API pattern?"
    }
  };

  // Fake context where we know it's REST
  const taskRelevantContext = {
    items: [
      { key: "ARCHITECTURE_API_PATTERN", value: "REST", type: "FACT" }
    ]
  };

  const intentSpec = createIntentSpec("CRUD");

  // We expect validateProposal to remove the question if it finds a fact that contradicts the need to ask.
  // For simplicity, let's say the validator maps "architecture" to facts.
  // We'll implement a simple mock logic for the test.
  const validated = validateProposal(proposal, intentSpec, taskRelevantContext);
  assert.strictEqual(validated.question, null);
});

test("applyProposal merges cleanly and returns new instance", () => {
  const initial = createIntentSpec("CRUD", {
    requirements: ["Req 1"]
  });

  const validProposal = {
    updates: { objective: "Better CRUD" },
    addRequirements: ["Req 2", "Req 1"], // Duplicate
    addConstraints: ["Node"],
    detectedUnknowns: [{ id: "u1", dimension: "ux", blocking: true }]
  };

  const result = applyProposal(initial, validProposal);

  // New instance
  assert.notStrictEqual(result, initial);

  // Merged uniquely
  assert.deepStrictEqual(result.requirements, ["Req 1", "Req 2"]);
  assert.deepStrictEqual(result.constraints, ["Node"]);
  assert.strictEqual(result.objective, "Better CRUD");
  assert.strictEqual(result.unknowns.length, 1);
  assert.strictEqual(result.unknowns[0].id, "u1");
});
