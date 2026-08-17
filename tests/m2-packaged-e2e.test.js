"use strict";

// SOURCE-TREE CLI + LIVE PROVIDER TESTS.
//
// NOTE: despite the historical "packaged" name, this file executes
// bin/orquestrador-maestro.js directly from the source tree — it does NOT
// npm pack / fresh install / use an installed.bin. True packaging is
// covered separately by tests/m2-true-packaged-e2e.test.js.

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { makeTempDir } = require("./test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

// source-tree CLI smoke — the batch entry points are wired in the CLI and
// it boots cleanly without AI calls.
test("source-tree CLI: --help exits 0 and exposes go/plan [--auto] batch entry points", () => {
  const result = spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 20000
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /go \[--auto\]/);
  assert.match(result.stdout, /plan \[--auto\]/);
  assert.match(result.stdout, /interviewer ID/);
});

// source-tree CLI over the runtime application store —
// mission create/show round-trip persists and retrieves deterministically.
test("source-tree CLI: mission create → mission show round-trip persists via --project-path", () => {
  const projectPath = makeTempDir("m2-source-cli-e2e-");

  const created = spawnSync(process.execPath, [
    cliPath,
    "mission",
    "create",
    "--project-path",
    projectPath,
    "CRUD de produtos"
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30000
  });

  assert.equal(created.status, 0, created.stderr);
  const mission = JSON.parse(created.stdout);
  assert.ok(mission.id, "mission id must be returned");
  assert.equal(mission.objective, "CRUD de produtos");

  const shown = spawnSync(process.execPath, [
    cliPath,
    "mission",
    "show",
    mission.id,
    "--project-path",
    projectPath
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30000
  });

  assert.equal(shown.status, 0, shown.stderr);
  const retrieved = JSON.parse(shown.stdout);
  assert.equal(retrieved.id, mission.id);
  assert.equal(retrieved.objective, "CRUD de produtos");
});

// Real-provider batch E2E through the source-tree CLI.
// Gated by env M2_PACKAGED_E2E=1 because it invokes a live AI provider
// (network + tokens). Assertions stay deterministic: the process must
// exit cleanly (success brief or explicit failure), never hang or crash.
test("source-tree CLI (gated): go --auto reaches a deterministic terminal state", { skip: process.env.M2_PACKAGED_E2E !== "1" }, () => {
  const projectPath = makeTempDir("m2-source-cli-ai-");

  const result = spawnSync(process.execPath, [
    cliPath,
    "go",
    "--auto",
    "--project-path",
    projectPath,
    "criar um CRUD de produtos"
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 180000
  });

  assert.ok(result.status === 0 || result.status === 1, `status ${result.status}: ${result.stderr}`);
  assert.notEqual(result.stdout.length, 0, "must produce output");
});