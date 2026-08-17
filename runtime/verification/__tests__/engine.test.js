"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { VerificationEngine, inferCommands } = require("../engine");

test("verification runs commands and captures real result evidence", async () => {
  const verification = await new VerificationEngine().verify({
    id: "verification-1", runId: "run-1", commands: [{ name: "pass", command: `${process.execPath} -e \"process.exit(0)\"` }]
  });
  assert.equal(verification.status, "passed");
  assert.equal(verification.checks[0].exitCode, 0);
});

test("verification command inference is conservative", () => {
  assert.deepEqual(inferCommands({ scripts: { lint: "eslint .", deploy: "ship", test: "node --test" } }), [
    { name: "lint", command: "npm run lint" }, { name: "test", command: "npm run test" }
  ]);
});

test("verification without an executable check is explicitly skipped", async () => {
  const verification = await new VerificationEngine().verify({ id: "verification-2", runId: "run-2", commands: [] });
  assert.equal(verification.status, "skipped");
});
