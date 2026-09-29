"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("event families are exhaustive, unique and reject unknown types", () => {
  const { FAMILIES_TYPES, RESERVED_FAMILIES, familyOf } = require("../runtime/events/event-families");
  const all = Object.values(FAMILIES_TYPES).flat();
  assert.equal(new Set(all).size, all.length);
  for (const type of ["mission.created", "run.started", "artifact.created", "provider.output", "task.completed"]) {
    assert.equal(typeof familyOf(type), "string");
  }
  assert.equal(familyOf("run.started"), "task.*");
  assert.equal(familyOf("artifact.created"), "task.*");
  assert.deepEqual(RESERVED_FAMILIES, ["skill.*"]);
  assert.deepEqual(FAMILIES_TYPES["attention.*"], ["attention.created", "attention.snoozed", "attention.resolved"]);
  assert.throws(() => familyOf("invented.event"), { code: "UNKNOWN_EVENT_FAMILY" });
});
