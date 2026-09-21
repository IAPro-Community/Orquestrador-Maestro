"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { familyOf } = require("../event-families");

test("resolution lifecycle events remain valid protocol v2 task-family events", () => {
  for (const type of [
    "resolution.planned",
    "budget.reserved",
    "budget.committed",
    "budget.released",
    "evidence.created",
    "provider.handoff",
    "outcome.validated",
    "outcome.revoked",
    "outcome.revalidated"
  ]) {
    assert.equal(familyOf(type), "task.*", type);
  }
});
