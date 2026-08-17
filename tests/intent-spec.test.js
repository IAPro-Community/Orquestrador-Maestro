"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { createIntentSpec, createIntentUnknown, isValidTransition } = require("../runtime/planner/intent-spec");

test("IntentSpec creation and immutability", () => {
  const spec = createIntentSpec("Criar CRUD");

  assert.strictEqual(spec.intent, "Criar CRUD");
  assert.strictEqual(spec.status, "CREATED");
  assert.deepStrictEqual(spec.requirements, []);
  assert.deepStrictEqual(spec.constraints, []);
  assert.deepStrictEqual(spec.userDecisions, []);
  assert.deepStrictEqual(spec.unknowns, []);

  assert.throws(() => {
    spec.status = "READY";
  }, TypeError, "Should be immutable");
});

test("IntentUnknown creation and immutability", () => {
  const unknown = createIntentUnknown({
    id: "u-1",
    dimension: "architecture",
    description: "API pattern missing",
    reason: "No evidence found",
    blocking: true,
    status: "OPEN"
  });

  assert.strictEqual(unknown.id, "u-1");
  assert.strictEqual(unknown.blocking, true);

  assert.throws(() => {
    unknown.status = "RESOLVED";
  }, TypeError, "Should be immutable");
});

test("Lifecycle valid transitions", () => {
  assert.strictEqual(isValidTransition("CREATED", "DISCOVERING"), true);
  assert.strictEqual(isValidTransition("DISCOVERING", "REFINING"), true);
  assert.strictEqual(isValidTransition("REFINING", "READY"), true);
  assert.strictEqual(isValidTransition("READY", "BRIEF_GENERATED"), true);
  assert.strictEqual(isValidTransition("BRIEF_GENERATED", "APPROVED"), true);
});

test("Lifecycle invalid transitions", () => {
  assert.strictEqual(isValidTransition("CREATED", "READY"), false);
  assert.strictEqual(isValidTransition("READY", "DISCOVERING"), false);
  assert.strictEqual(isValidTransition("APPROVED", "REFINING"), false); // As per user spec, BRIEF_GENERATED -> REFINING is allowed, but maybe not APPROVED -> REFINING. Wait, spec says: BRIEF_GENERATED -> REFINING works.
});
