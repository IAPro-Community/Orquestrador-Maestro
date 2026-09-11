"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CANONICAL_DIR_NAME, LEGACY_DIR_NAME, resolveMaestroRoot, resolveProjectMaestroRoot } = require("../runtime/config/maestro-paths");

test("new homes use the canonical Maestro directory", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-home-"));
  assert.equal(resolveMaestroRoot({ home }), path.join(home, CANONICAL_DIR_NAME));
});

test("existing legacy homes remain readable without automatic rename", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-legacy-home-"));
  fs.mkdirSync(path.join(home, LEGACY_DIR_NAME));
  assert.equal(resolveMaestroRoot({ home }), path.join(home, LEGACY_DIR_NAME));
  assert.equal(fs.existsSync(path.join(home, LEGACY_DIR_NAME)), true);
});

test("legacy project runtime remains selected when a new config directory is added", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-project-path-"));
  fs.mkdirSync(path.join(project, LEGACY_DIR_NAME, "runtime"), { recursive: true });
  fs.mkdirSync(path.join(project, CANONICAL_DIR_NAME));
  assert.equal(resolveProjectMaestroRoot(project), path.join(project, LEGACY_DIR_NAME));
  assert.equal(resolveProjectMaestroRoot(project, { prefer: "canonical" }), path.join(project, CANONICAL_DIR_NAME));
});
