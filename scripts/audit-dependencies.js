#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const mode = process.argv[2] || "audit";

if (!["audit", "outdated"].includes(mode)) {
  console.error("Usage: node scripts/audit-dependencies.js [audit|outdated]");
  process.exit(2);
}

const root = path.resolve(__dirname, "..");
const targets = [
  ["root", root],
  ["playwright-skill", path.join(root, "skill-library", "community-skills", "playwright-skill")],
  [
    "loki frontend example",
    path.join(root, "skill-library", "community-skills", "loki-mode", "examples", "todo-app-generated", "frontend"),
  ],
  [
    "loki backend example",
    path.join(root, "skill-library", "community-skills", "loki-mode", "examples", "todo-app-generated", "backend"),
  ],
];

// Security CI already audits these two workspaces independently. Include
// them in the maintainer's full outdated inventory without duplicating CI.
if (mode === "outdated") {
  targets.push(["site", path.join(root, "site")],
    ["benchmark-harness", path.join(root, "benchmark-harness")]);
}

const npmBin = "npm";
const useShell = process.platform === "win32";
let hasAuditFailure = false;

for (const [label, cwd] of targets) {
  console.log(`\n== ${label} ==`);

  if (!fs.existsSync(path.join(cwd, "package.json"))) {
    console.log("Skipped: package.json not present in this snapshot.");
    continue;
  }

  if (mode === "outdated") {
    const result = spawnSync(npmBin, ["outdated", "--json", "--package-lock-only"], {
      cwd,
      encoding: "utf8",
      shell: useShell,
    });

    if (result.error) {
      console.error(result.error.message);
      continue;
    }

    const output = result.stdout.trim();
    if (!output) {
      console.log("No outdated dependencies reported.");
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr || "");
      continue;
    }

    const outsideCurrentRange = Object.entries(parsed).filter(([, info]) => info.wanted !== info.latest);
    if (outsideCurrentRange.length === 0) {
      console.log("No updates beyond the current manifest ranges.");
      continue;
    }

    console.log("Updates outside current manifest ranges:");
    for (const [name, info] of outsideCurrentRange) {
      console.log(`- ${name}: wanted ${info.wanted}, latest ${info.latest}`);
    }
    continue;
  }

  const result = spawnSync(npmBin, [mode], {
    cwd,
    stdio: "inherit",
    shell: useShell,
  });

  if (result.error) {
    console.error(result.error.message);
    hasAuditFailure = true;
    continue;
  }

  if (mode === "audit" && result.status !== 0) {
    hasAuditFailure = true;
  }
}

process.exit(hasAuditFailure ? 1 : 0);
