"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { validatePaths, WIN_RESERVED_PATTERN, WIN_INVALID_CHARS } = require("../scripts/validate-git-paths");

test("git paths validation — control characters and special characters", () => {
  const invalidCases = [
    "data/users.json\npackage.json",
    "src/file\rname.js",
    "test/\x00hidden.js",
    "test/\x1Fsecret.js",
    "src/<invalid>.js",
    "src/>greater.js",
    "src/:colon.js",
    "src/\"quote.js",
    "src/|pipe.js",
    "src/?question.js",
    "src/*asterisk.js"
  ];

  for (const badPath of invalidCases) {
    const violations = validatePaths([badPath]);
    assert.equal(violations.length, 1, `Should fail for path: ${JSON.stringify(badPath)}`);
  }
});

test("git paths validation — Windows reserved device names", () => {
  const reservedCases = [
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM9",
    "LPT1",
    "LPT9",
    "con.txt",
    "Nul.json",
    "src/aux/handler.js",
    "path/to/PRN/file.js"
  ];

  for (const badPath of reservedCases) {
    const violations = validatePaths([badPath]);
    assert.ok(violations.length >= 1, `Should detect reserved name in: ${badPath}`);
  }

  const validSimilarNames = [
    "src/constants.js",
    "src/connect.js",
    "src/auxiliary.js",
    "src/null-handler.js"
  ];

  for (const goodPath of validSimilarNames) {
    const violations = validatePaths([goodPath]);
    assert.equal(violations.length, 0, `Should NOT fail valid similar name: ${goodPath}`);
  }
});

test("git paths validation — trailing dot and space", () => {
  const badTrailing = [
    "src/trailing.",
    "src/trailing ",
    "folder./file.js",
    "folder /file.js",
    "deep/nested /file.js"
  ];

  for (const badPath of badTrailing) {
    const violations = validatePaths([badPath]);
    assert.equal(violations.length, 1, `Should fail for trailing dot/space: ${badPath}`);
  }

  const good = [
    "src/normal-file.js",
    "package.json",
    ".gitignore",
    ".github/workflows/test.yml",
    "benchmark-harness/src/index.ts"
  ];

  const violations = validatePaths(good);
  assert.equal(violations.length, 0, "Valid paths should have zero violations");
});
