"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { SkillRouterV3 } = require("../runtime/planner/skill-router-v3");

const maestroRoot = path.resolve(__dirname, "..", "orquestrador");

const cases = [
  ["frontend-design", "skill-open-design-ui"],
  ["ui-ux-pro-max", "skill-product-ux-architecture"],
  ["impeccable", "skill-impeccable"],
  ["emil-design-eng", "skill-design-engineering-craft"],
  ["design-motion-principles", "skill-motion-design-principles"]
];

for (const [intent, expected] of cases) {
  test("design alias " + intent + " routes to " + expected, () => {
    const router = new SkillRouterV3({ maestroRoot });
    const result = router.resolve(intent);
    assert.equal(result.primarySkill?.id, expected);
    assert.equal(result.confidence, "high");
  });
}

test("product-wide UX planning is distinct from single-screen polish", () => {
  const router = new SkillRouterV3({ maestroRoot });
  const result = router.resolve("quero planejar a ui inteira do app, mapear todas as telas e navegação do produto");
  assert.equal(result.primarySkill?.id, "skill-product-ux-architecture");
  assert.notEqual(result.primarySkill?.id, "skill-impeccable");
});

test("motion review stays specialized instead of selecting generic visual design", () => {
  const router = new SkillRouterV3({ maestroRoot });
  const result = router.resolve("revisar animação, easing e reduced motion");
  assert.equal(result.primarySkill?.id, "skill-motion-design-principles");
  assert.notEqual(result.primarySkill?.id, "skill-open-design-ui");
});

test("craft implementation stays distinct from audit-only impeccable", () => {
  const router = new SkillRouterV3({ maestroRoot });
  const result = router.resolve("quero optical alignment, type rhythm e detalhes que fazem parecer caro");
  assert.equal(result.primarySkill?.id, "skill-design-engineering-craft");
});

test("impeccable owns bounded audit and polish language", () => {
  const router = new SkillRouterV3({ maestroRoot });
  const result = router.resolve("auditar hierarquia e espaçamento desta tela com impeccable");
  assert.equal(result.primarySkill?.id, "skill-impeccable");
});
