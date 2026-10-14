#!/usr/bin/env node
"use strict";

// 1.1.0 (CONT-01): single contract gate for CI and local use.
// Runs the deterministic validators that do not require PowerShell:
// public catalog check, skill catalog validate+check, and the contract
// regression tests (path contract, aliases, policy drift, preservation).
// PowerShell-only validators (validate-public.ps1) stay in the Windows CI
// lane; `npm run validate` covers them when pwsh exists.

const { spawnSync } = require("node:child_process");

const STEPS = [
  ["node", ["scripts/public-skill-catalog.js", "check"]],
  ["node", ["scripts/skill-catalog.js", "validate"]],
  ["node", ["scripts/skill-catalog.js", "check"]],
  ["node", ["--test",
    "tests/path-contract.test.js",
    "tests/alias-deprecated.test.js",
    "tests/policy-drift-1-1-0.test.js",
    "tests/policy-enforcer.test.js",
    "tests/doctor-strict.test.js",
    "tests/router-determinism.test.js",
    "tests/skill-routing.test.js",
    "tests/public-skill-catalog.test.js",
    "tests/product-capability-matrix.test.js",
    "tests/installer-contract.test.js"
  ]]
];

let failed = 0;
for (const [command, args] of STEPS) {
  console.log(`\n[contracts] $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  const code = result.error ? 1 : (typeof result.status === "number" ? result.status : 1);
  if (code !== 0) failed = code;
}
if (failed !== 0) {
  console.error("\n[contracts] FAILED");
  process.exit(failed);
}
console.log("\n[contracts] ALL CHECKS PASSED");
