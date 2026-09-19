"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "bin", "orquestrador-maestro.js");

function runUsage(limitArgs) {
  try {
    execFileSync(process.execPath, [CLI, "usage", ...limitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 });
    return { ok: true, stderr: "" };
  } catch (error) {
    return { ok: false, stderr: String(error.stderr || error.message || "") };
  }
}

test("usage --limit accepts valid integers", () => {
  for (const value of ["1", "20", "200"]) {
    const result = runUsage(["--limit", value, "--project-path", __dirname]);
    assert.equal(result.ok, true, `--limit ${value} must be accepted`);
  }
});

test("usage --limit rejects partial, fractional and out-of-range values", () => {
  for (const value of ["0", "201", "10x", "1.5", "-1", "", " 20 ", "0x14"]) {
    const result = value === ""
      ? runUsage(["--limit", "--json"])
      : runUsage(["--limit", value]);
    assert.equal(result.ok, false, `--limit ${JSON.stringify(value)} must be rejected`);
    assert.match(result.stderr, /--limit deve ser um inteiro entre 1 e 200|exige um valor/u);
  }
});
