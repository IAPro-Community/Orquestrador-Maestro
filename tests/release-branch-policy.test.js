"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { releaseBranch } = require("../scripts/release-branch-policy");
test("1.2 RC is released only from candidate, stable only from main", () => {
  assert.equal(releaseBranch("1.2.0-rc.2", "release/1.2.0"), "release/1.2.0");
  assert.equal(releaseBranch("1.2.0", "main"), "main");
  assert.equal(releaseBranch("1.3.0-rc.1", "main"), "main");
  for (const branch of ["v1", "master", "feature/test", "release/1.2.0", ""]) {
    assert.throws(() => releaseBranch("1.2.0", branch), /authorized from main/);
  }
  assert.throws(() => releaseBranch("1.2.0-rc.2", "main"), /authorized from release/);
  assert.throws(() => releaseBranch("invalid", "main"), /Invalid/);
});
