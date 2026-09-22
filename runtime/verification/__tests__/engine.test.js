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


test("verification redacts secrets and local paths before persistence", async () => {
  const token = "ghp_" + "D".repeat(40);
  const verification = await new VerificationEngine().verify({
    id: "verification-redacted",
    runId: "run-redacted",
    commands: [{
      name: "redaction",
      command: `${process.execPath} -e "console.log('Bearer ${token} /home/alice/private')"`
    }]
  });
  const serialized = JSON.stringify(verification.checks[0]);
  assert.doesNotMatch(serialized, new RegExp(token, "u"));
  assert.doesNotMatch(serialized, /\/home\/alice\/private/u);
  assert.match(serialized, /redacted/u);
});
