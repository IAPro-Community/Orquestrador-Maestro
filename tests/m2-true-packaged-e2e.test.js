"use strict";

// TRUE PACKAGED DETERMINISTIC E2E.
//
// This test is named "true packaged" on purpose: unlike the older
// m2-packaged-e2e.test.js (which invoked bin/orquestrador-maestro.js
// straight from the source tree), this test performs a REAL
//
//   npm pack  ->  fresh npm install  ->  installed binary
//
// cycle from the CURRENT working tree and then exercises the public CLI
// through the installed entrypoint. It never touches source-tree bin and
// never requires a live AI provider, so it is deterministic and CI-safe.
//
// node-pty requires native compilation; the installed package lazy-loads it
// (runtime/terminals/pty-session-manager.js require is try/catch guarded),
// so --ignore-scripts installs are valid for CLI commands that do not use TUI.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const epoch = Date.now().toString(36);
const packDir = path.join(os.tmpdir(), `maestro-m2-true-pack-${epoch}`);
const installDir = path.join(os.tmpdir(), `maestro-m2-true-install-${epoch}`);
const projectDir = path.join(os.tmpdir(), `maestro-m2-true-project-${epoch}`);

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", timeout: 180000, ...opts });
}

test("TRUE packaged: npm pack from current working tree", () => {
  fs.mkdirSync(packDir, { recursive: true });
  const packed = run("npm", ["pack", "--pack-destination", packDir], { cwd: repoRoot });
  assert.equal(packed.status, 0, packed.stderr);
  const tgz = fs.readdirSync(packDir).find((f) => f.endsWith(".tgz"));
  assert.ok(tgz, "tgz must be produced");
});

test("TRUE packaged: fresh install in isolated prefix", () => {
  fs.mkdirSync(installDir, { recursive: true });
  const tgz = fs.readdirSync(packDir).find((f) => f.endsWith(".tgz"));
  const installed = run("npm", ["install", "--prefix", installDir, "--no-audit", "--no-fund", "--ignore-scripts", path.join(packDir, tgz)]);
  assert.equal(installed.status, 0, installed.stderr);
  const binPath = path.join(installDir, "node_modules", ".bin", "orquestrador-maestro");
  assert.ok(fs.existsSync(binPath), "installed binary must exist");
});

test("TRUE packaged: installed binary --version and --help", () => {
  const binPath = path.join(installDir, "node_modules", ".bin", "orquestrador-maestro");
  const version = run(binPath, ["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);

  const help = run(binPath, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /go \[--auto\]/);
  assert.match(help.stdout, /plan \[--auto\]/);
});

test("TRUE packaged: M2 batch modules loadable from installed package", () => {
  const moduleRoot = path.join(installDir, "node_modules", "@iapro", "orquestrador-maestro-cli");
  const plannerDir = path.join(moduleRoot, "runtime", "planner");
  const required = [
    "batch-question.js",
    "question-set-validator.js",
    "question-scheduler.js",
    "batch-answer-collector.js",
    "batch-answer-applier.js",
    "batch-intent-discoverer.js",
    "intent-reconciler.js",
    "batch-refinement-coordinator.js",
    "clack-batch-adapter.js",
    "plan-semantic-diff.js",
    "plan-review-workflow.js",
    "plan-revision-service.js",
    "plan-revision-compiler.js",
    "plan-artifact-renderer.js",
    "plan-artifact-store.js",
    "external-editor-launcher.js"
  ];
  for (const file of required) {
    assert.ok(fs.existsSync(path.join(plannerDir, file)), `installed package must include ${file}`);
  }
  const smoke = run(process.execPath, ["-e",
    `const p = require(${JSON.stringify(path.join(moduleRoot, "runtime", "planner", "index.js"))});` +
    `const names = Object.keys(p);` +
    `require(${JSON.stringify(path.join(moduleRoot, "runtime", "planner", "batch-question.js"))});` +
    `require(${JSON.stringify(path.join(moduleRoot, "runtime", "planner", "batch-refinement-coordinator.js"))});` +
    `console.log("M2_MODULES_OK=" + names.length);`
  ]);
  assert.equal(smoke.status, 0, smoke.stderr);
  assert.match(smoke.stdout, /M2_MODULES_OK=/);
});

test("TRUE packaged: installed CLI mission create → show round-trip on synthetic project", () => {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, ".orquestrador"), { recursive: true });
  const binPath = path.join(installDir, "node_modules", ".bin", "orquestrador-maestro");

  const created = run(binPath, ["mission", "create", "--project-path", projectDir, "CRUD de produtos"]);
  assert.equal(created.status, 0, created.stderr);
  const mission = JSON.parse(created.stdout);
  assert.ok(mission.id, "mission id must be returned");
  assert.equal(mission.objective, "CRUD de produtos");

  const shown = run(binPath, ["mission", "show", mission.id, "--project-path", projectDir]);
  assert.equal(shown.status, 0, shown.stderr);
  const retrieved = JSON.parse(shown.stdout);
  assert.equal(retrieved.id, mission.id);
  assert.equal(retrieved.objective, "CRUD de produtos");
});

test("TRUE packaged: installed CLI rejects unknown mission subcommand deterministically", () => {
  const binPath = path.join(installDir, "node_modules", ".bin", "orquestrador-maestro");
  const listed = run(binPath, ["mission", "list", "--project-path", projectDir]);
  assert.equal(listed.status, 1, "unknown subcommand must exit 1");
  assert.match(listed.stdout + listed.stderr, /Uso: maestro mission <create\|show>/);
});