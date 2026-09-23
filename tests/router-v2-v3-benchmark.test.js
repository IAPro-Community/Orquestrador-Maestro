"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { IntentRouter } = require("../runtime/planner/intent-router");
const { SkillRouterV3 } = require("../runtime/planner/skill-router-v3");
const { benchmarkRouters } = require("../runtime/planner/router-benchmark");

const root = path.resolve(__dirname, "..");
const maestroRoot = path.join(root, "orquestrador");

test("Router v3 benchmarks against the labeled Router v2 baseline without canonical regressions", () => {
  const suite = JSON.parse(fs.readFileSync(
    path.join(maestroRoot, "SKILL_BEHAVIOR_CASES_V1.json"),
    "utf8"
  ));
  const report = benchmarkRouters(suite.cases, {
    routerV2: new IntentRouter({ maestroRoot }),
    routerV3: new SkillRouterV3({ maestroRoot })
  });

  assert.equal(report.total, suite.cases.length);
  assert.equal(report.labeled, suite.cases.length);
  assert.equal(report.v2.correct, suite.cases.length);
  assert.equal(report.v3.correct, suite.cases.length, JSON.stringify(
    report.results.filter((item) => item.v3Primary !== item.expectedPrimary),
    null,
    2
  ));
  assert.deepEqual(report.comparison.v3Regressions, []);
  assert.ok(report.v3.avgSelectedSkills <= 3);
  assert.ok(Number.isFinite(report.v3.avgEstimatedContextTokens));
});
