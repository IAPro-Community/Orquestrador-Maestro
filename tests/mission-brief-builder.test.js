"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { buildMissionBrief } = require("../runtime/planner/mission-brief-builder");
const { createIntentSpec } = require("../runtime/planner/intent-spec");

test("buildMissionBrief derived from IntentSpec", () => {
  const spec = createIntentSpec("CRUD", {
    objective: "Create product CRUD",
    requirements: ["Req 1", "Req 2"],
    constraints: ["React only"],
    userDecisions: ["User says Yes"]
  });

  const taskRelevantContext = { items: [{ key: "foo", value: "bar", type: "FACT" }] };

  const brief = buildMissionBrief(spec, taskRelevantContext);

  assert.strictEqual(brief.objective, "Create product CRUD");
  assert.deepStrictEqual(brief.requirements, ["Req 1", "Req 2"]);
  assert.deepStrictEqual(brief.constraints, ["React only"]);
  assert.deepStrictEqual(brief.userDecisions, ["User says Yes"]);

  // ensure we don't just dump conversation history
  // it has proper formal requirements array
});
