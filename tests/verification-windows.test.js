"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runCommand } = require("../runtime/verification/engine");

test("Windows verification executes allowlisted npm scripts with a safe cmd shim", {
  skip: process.platform !== "win32" ? "Windows-only CreateProcess regression" : false
}, async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-windows-verify-"));
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({
    private: true,
    scripts: { test: "node -e \"process.stdout.write('verified')\"" }
  }));
  const result = await runCommand("npm run test", { cwd, timeoutMs: 15000 });
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /verified/);
});

test("Windows verification rejects arbitrary batch execution", {
  skip: process.platform !== "win32" ? "Windows-only batch shim guard" : false
}, async () => {
  const result = await runCommand("malicious.cmd", { timeoutMs: 2000 });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Batch shims are not permitted/);
});
