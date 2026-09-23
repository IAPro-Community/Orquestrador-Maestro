"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { IntentRouter } = require("../runtime/planner/intent-router.js");
const { runBehaviorCases } = require("../runtime/skills/behavior-harness.js");

const repoRoot = path.resolve(__dirname, "..");

test("Maestro Core routing baseline satisfies V1 behavior cases", async () => {
  const suite = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "orquestrador", "SKILL_BEHAVIOR_CASES_V1.json"),
    "utf8"
  ));
  const router = new IntentRouter({
    maestroRoot: path.join(repoRoot, "orquestrador")
  });

  const report = await runBehaviorCases(suite.cases, async ({ intent }) => {
    const resolved = router.resolve(intent);
    const selected = [
      resolved.primarySkill?.id,
      ...(resolved.chainedSkills || []).map((skill) => skill.id)
    ].filter(Boolean);
    return {
      primarySkill: resolved.primarySkill?.id || null,
      selectedSkills: selected
    };
  });

  assert.equal(
    report.passed,
    true,
    JSON.stringify(report.results.filter((result) => !result.passed), null, 2)
  );
  assert.equal(report.total, 16);
});
