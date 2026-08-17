const assert = require("node:assert");
const { test } = require("node:test");
const { classifyComplexity, COMPLEXITY_LEVELS } = require("../runtime/planner/model-router");

test("classifyComplexity should return SIMPLE for basic shell commands", () => {
  assert.strictEqual(classifyComplexity("ls -la"), COMPLEXITY_LEVELS.SIMPLE);
  assert.strictEqual(classifyComplexity("npm install express"), COMPLEXITY_LEVELS.SIMPLE);
});

test("classifyComplexity should return COMPLEX for architecture", () => {
  assert.strictEqual(classifyComplexity("planejar a arquitetura do novo módulo"), COMPLEXITY_LEVELS.COMPLEX);
});
