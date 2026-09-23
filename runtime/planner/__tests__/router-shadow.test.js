"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluateRouterShadow, normalizeVersion } = require("../router-shadow");

function router(result) {
  return { resolve: () => result };
}

test("v3 shadow failure never breaks active v2", () => {
  const v2 = { primarySkill: { id: "skill-a" }, allSkills: [{ id: "skill-a" }] };
  const v3 = { resolve() { const error = new Error("bad V3 registry"); error.code = "V3_BAD_REGISTRY"; throw error; } };
  const result = evaluateRouterShadow({
    intent: "test",
    routerV2: router(v2),
    routerV3: v3,
    activeVersion: "2"
  });

  assert.equal(result.resolved, v2);
  assert.equal(result.shadow.v2Primary, "skill-a");
  assert.equal(result.shadow.v3Primary, null);
  assert.equal(result.shadow.v3ShadowError, "V3_BAD_REGISTRY");
});

test("active v3 fails when v3 routing cannot be computed", () => {
  const v3 = { resolve() { throw new Error("bad V3 registry"); } };
  assert.throws(() => evaluateRouterShadow({
    intent: "test",
    routerV2: router({ primarySkill: null }),
    routerV3: v3,
    activeVersion: "3"
  }), /bad V3 registry/u);
});

test("shadow records agreement without executing duplicate work", () => {
  const v2 = { primarySkill: { id: "skill-a" }, allSkills: [{ id: "skill-a" }] };
  const v3 = {
    primarySkill: { id: "skill-a" },
    allSkills: [{ id: "skill-a" }],
    complexity: { level: "SIMPLE" },
    estimatedContextTokens: 1200
  };
  const result = evaluateRouterShadow({
    intent: "test",
    routerV2: router(v2),
    routerV3: router(v3)
  });

  assert.equal(result.shadow.samePrimary, true);
  assert.equal(result.shadow.v3Complexity, "SIMPLE");
  assert.equal(result.shadow.v3EstimatedContextTokens, 1200);
  assert.equal(result.shadow.v3SkillCount, 1);
});

test("Router v3 is the default while v2 remains an explicit rollback path", () => {
  const v2 = { primarySkill: { id: "skill-v2" }, allSkills: [{ id: "skill-v2" }] };
  const v3 = {
    primarySkill: { id: "skill-v3" },
    allSkills: [{ id: "skill-v3" }],
    complexity: { level: "STANDARD" },
    estimatedContextTokens: 2000
  };
  const result = evaluateRouterShadow({
    intent: "test",
    routerV2: router(v2),
    routerV3: router(v3)
  });

  assert.equal(result.resolved, v3);
  assert.equal(result.shadow.activeVersion, 3);
  assert.equal(result.shadow.v2Primary, "skill-v2");
  assert.equal(result.shadow.v3Primary, "skill-v3");
});

test("router version is explicit and bounded", () => {
  assert.equal(normalizeVersion(undefined), "3");
  assert.equal(normalizeVersion("3"), "3");
  assert.throws(() => normalizeVersion("4"), /must be 2 or 3/u);
});
