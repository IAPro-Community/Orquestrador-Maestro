"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compactNativeRoute } = require("../runtime/integrations/harness/routing");
const { classifyComplexity } = require("../runtime/planner/complexity-gate");

test("OpenCode uses one compact automatic contract", () => {
  const root = path.join(__dirname, "..");
  const config = require("../tool-profiles/opencode-global/opencode.json");
  assert.deepEqual(config.instructions, ["~/AGENTS.md"]);
  assert.ok(Buffer.byteLength(fs.readFileSync(path.join(root, "home", "AGENTS.md"), "utf8")) < 4000);
});
test("native MICRO route excludes raw intent, catalog and rejected candidates", () => {
  const result = compactNativeRoute({ routingVersion: 3, profile: "fast", complexity: classifyComplexity("git status"), allSkills: [], intent: "private", rejected: ["large"], estimatedContextTokens: 0, estimatedContextOverBudget: false });
  assert.equal(result.complexity, "MICRO");
  assert.equal(result.planningDepth, "none");
  assert.equal(result.allowSubagents, false);
  assert.equal(result.contextBudget, 1500);
  assert.equal("intent" in result, false);
  assert.equal("rejected" in result, false);
});
