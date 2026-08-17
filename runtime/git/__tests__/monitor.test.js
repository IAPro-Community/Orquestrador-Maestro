"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { snapshot } = require("../monitor");

test("git monitor reports an unavailable non-repository without mutating it", () => {
  const state = snapshot(process.cwd());
  assert.equal(typeof state.available, "boolean");
  assert.ok(Array.isArray(state.files));
});
