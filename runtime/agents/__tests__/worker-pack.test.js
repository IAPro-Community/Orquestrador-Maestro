"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SPAWN_REASONS, buildWorkerContextPack, shouldSimplify, assertSpawnReason } = require("../worker-pack");

test("worker pack is bounded with digest and no session replay", () => {
  const pack = buildWorkerContextPack({
    objective: "Fix login redirect",
    acceptanceCriteria: ["redirect works", "tests pass"],
    files: ["src/auth.js"],
    expectedOutput: "patch summary",
    verificationTarget: "npm test",
    maxChars: 500
  });
  assert.ok(pack.chars <= 500);
  assert.equal(typeof pack.digest, "string");
  assert.equal(pack.digest.length, 32);
  assert.doesNotMatch(pack.pack, /full conversation history/u);
});

test("simplification is skipped without signal and runs with signal", () => {
  assert.deepEqual(shouldSimplify({ diffStats: { filesChanged: 2, linesAdded: 40 } }), { simplify: false, skipReason: "no-simplification-signal" });
  assert.equal(shouldSimplify({ explicitRequest: true }).simplify, true);
  assert.equal(shouldSimplify({ findings: [{ code: "duplicated-code" }] }).simplify, true);
  assert.equal(shouldSimplify({}).skipReason, "no-simplification-signal");
});

test("spawn reasons are constrained to legitimate values", () => {
  assert.equal(assertSpawnReason("independent-workstream"), "independent-workstream");
  assert.throws(() => assertSpawnReason("just-because"), /spawnReason must be one of/);
  assert.ok(SPAWN_REASONS.includes("specialized-review"));
});
