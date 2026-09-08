"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { makeTempDir } = require("./test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

test("dry-run does not create install targets under the provided home path", () => {
  const homePath = makeTempDir("orquestrador-dry-run-home-");

  const result = spawnSync(process.execPath, [
    cliPath,
    "dry-run",
    "--home-path",
    homePath,
    "--core-only"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Mode\s+Target\s+Component/mu);
  assert.equal(fs.existsSync(path.join(homePath, ".orquestrador")), false);
  assert.equal(fs.existsSync(path.join(homePath, "AGENTS.md")), false);
});

test("update dry-run does not update the global npm CLI", () => {
  const homePath = makeTempDir("orquestrador-update-dry-run-home-");

  const result = spawnSync(process.execPath, [
    cliPath,
    "update",
    "--home-path",
    homePath,
    "--core-only",
    "--dry-run"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Atualizando a CLI npm/u);
  assert.match(result.stdout, /^Mode\s+Target\s+Component/mu);
  assert.equal(fs.existsSync(path.join(homePath, ".orquestrador")), false);
  assert.equal(fs.existsSync(path.join(homePath, "AGENTS.md")), false);
});

test("Windows npm.cmd execution is routed through cmd.exe", () => {
  const cliSource = fs.readFileSync(cliPath, "utf8");

  assert.match(cliSource, /process\.env\.ComSpec \|\| "cmd\.exe"/u);
  assert.match(cliSource, /"\/d", "\/s", "\/c", getNpmCommand\(\)/u);
  assert.match(cliSource, /return spawnSync\(getNpmCommand\(\), args, \{ \...options, shell: false \}\)/u);
});
