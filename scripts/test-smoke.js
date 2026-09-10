#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const SMOKE_TESTS = [
  "tests/benchmark-cli.test.js",
  "tests/memory.test.js",
  "tests/memory-context.test.js",
  "tests/memory-retention.test.js",
  "tests/merge-blocker-regression.test.js",
];

const ROOT = path.resolve(__dirname, "..");

let failed = 0;
let passed = 0;

for (const testFile of SMOKE_TESTS) {
  const fullPath = path.join(ROOT, testFile);
  console.log(`[SMOKE] START ${testFile}`);

  const result = spawnSync(process.execPath, ["--test", fullPath], {
    cwd: ROOT,
    stdio: "inherit",
    timeout: 60000,
  });

  if (result.status === 0) {
    console.log(`[SMOKE] PASS  ${testFile}`);
    passed++;
  } else {
    console.log(`[SMOKE] FAIL  ${testFile}`);
    console.log(`        exitCode=${result.status}  signal=${result.signal}`);
    if (result.error) {
      console.log(`        error=${result.error.message}`);
    }
    failed++;
  }
}

console.log(`\nSmoke summary: passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
