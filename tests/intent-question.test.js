"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { createIntentQuestion } = require("../runtime/planner/intent-question");

test("createIntentQuestion validates and creates immutable question", () => {
  const q = createIntentQuestion({
    id: "q1",
    dimension: "arch",
    text: "REST or GraphQL?",
    options: ["REST", "GraphQL"],
    blocking: true,
    reason: "Need API pattern",
    allowFreeText: false,
    allowRecommendation: true
  });

  assert.strictEqual(q.id, "q1");
  assert.strictEqual(q.options.length, 2);

  assert.throws(() => {
    q.blocking = false;
  }, TypeError, "Should be immutable");
});

test("createIntentQuestion throws on invalid types", () => {
  assert.throws(() => {
    createIntentQuestion({ id: "q1", dimension: "arch", text: "T", blocking: "not-a-bool" });
  }, TypeError);
});
