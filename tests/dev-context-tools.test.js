"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { makeTempDir, writeFile } = require("./test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const toolPath = path.join(repoRoot, "orquestrador", "bin", "dev-context-tools.js");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

function makeLegacyCompatibleDevProject() {
  const root = makeTempDir("orquestrador-dev-gates-");
  writeFile(root, "DEV/README.md", "# DEV\n");
  writeFile(root, "DEV/INDEX.md", [
    "# Index",
    "",
    "- HANDOFF.md",
    "- WORKLOG.md",
    "- VERIFY.md",
    "- SPECS/ACTIVE.md",
    "- WORKFLOWS/legacy-phase-plan.md",
    "- TESTS/legacy-regressions.md"
  ].join("\n"));
  writeFile(root, "DEV/HANDOFF.md", [
    "# Handoff",
    "",
    "## Snapshot",
    "",
    "- Updated: 2026-08-07",
    "- Entry: Added regression checks",
    "- Spec: `SPECS/ACTIVE.md`",
    "- Changed: Added DEV workflow coverage",
    "- Verified: node --test",
    "- Next context: report audit",
    "",
    "## Latest Work",
    "",
    "- Added strict DEV control files.",
    "",
    "## Recent Entries",
    "",
    "- 2026-08-07 regression audit"
  ].join("\n"));
  writeFile(root, "DEV/CONTEXT.md", [
    "# Context",
    "",
    "## State",
    "",
    "- Active migration of workflow docs.",
    "",
    "## Commands",
    "",
    "- node --test",
    "",
    "## Constraints And Risks",
    "",
    "- Preserve legacy DEV layout.",
    "",
    "## Next Context",
    "",
    "- Keep gate checker compatible."
  ].join("\n"));
  writeFile(root, "DEV/VERIFY.md", [
    "# Verify",
    "",
    "## Latest Verification",
    "",
    "- Date: 2026-08-07",
    "- Scope: DEV gate compatibility",
    "",
    "## Commands",
    "",
    "- node orquestrador/bin/dev-context-tools.js check-dev-gates --strict",
    "",
    "## Outcome",
    "",
    "- Passed: required files and headings present",
    "- Failed: none",
    "- Pending: human review"
  ].join("\n"));
  writeFile(root, "DEV/WORKLOG.md", [
    "# Worklog",
    "",
    "## 2026-08-07 Regression Audit",
    "",
    "- Spec: `DEV/SPECS/ACTIVE.md`",
    "- Changed: Added regression-only tests",
    "- Verified: node --test",
    "- Next context: summarize gaps"
  ].join("\n"));
  writeFile(root, "DEV/SPECS/ACTIVE.md", [
    "# Active Specification",
    "",
    "## Goal",
    "",
    "Keep DEV gates compatible with legacy workflow folders.",
    "",
    "## In Scope",
    "",
    "- Existing DEV control files.",
    "",
    "## Out Of Scope",
    "",
    "- Production code changes.",
    "",
    "## Acceptance",
    "",
    "- Gate checker passes on legacy-compatible trees.",
    "",
    "## Verification Plan",
    "",
    "- Run the DEV gate checker in strict mode.",
    "",
    "## Status",
    "",
    "In progress."
  ].join("\n"));
  writeFile(root, "DEV/WORKFLOWS/legacy-phase-plan.md", "# Legacy workflow\n");
  writeFile(root, "DEV/TESTS/legacy-regressions.md", "# Legacy tests\n");
  fs.mkdirSync(path.join(root, "DEV", "LOGS"), { recursive: true });
  return root;
}

test("check-dev-gates accepts DEV trees that include legacy workflow folders", () => {
  const projectRoot = makeLegacyCompatibleDevProject();

  const result = spawnSync(process.execPath, [
    toolPath,
    "check-dev-gates",
    "--project-path",
    projectRoot,
    "--strict"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DEV gates passed\./u);
});

test("CLI resolves a relative project path from the caller directory", () => {
  const projectRoot = makeLegacyCompatibleDevProject();

  const result = spawnSync(process.execPath, [
    cliPath,
    "check-dev-gates",
    "--project-path",
    ".",
    "--strict"
  ], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DEV gates passed\./u);
});

test("PowerShell DEV gate wrappers translate strict options on Windows", { skip: process.platform !== "win32" }, () => {
  const projectRoot = makeLegacyCompatibleDevProject();
  const wrapperPaths = [
    path.join(repoRoot, "scripts", "check-dev-gates.ps1"),
    path.join(repoRoot, "orquestrador", "bin", "check-dev-gates.ps1")
  ];

  for (const wrapperPath of wrapperPaths) {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", wrapperPath,
      "-ProjectPath", projectRoot,
      "-MaxEntries", "12",
      "-Strict"
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, `${wrapperPath}\n${result.stderr}`);
    assert.match(result.stdout, /DEV gates passed\./u);
  }
});
