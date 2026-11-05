"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { safeEntry, parse: parsePrune } = require("./p0-prune-branches.cjs");
const { parse: parseQa, tests: qaTests } = require("./p0-release-qa.cjs");

const sha = "a".repeat(40);
const entry = (name) => ({
  name, expectedHeadSha: sha, proofCommitSha: "b".repeat(40), pr: 123
});

test("cleanup accepts only reviewed source branch names and exact SHA proofs", () => {
  assert.equal(safeEntry(entry("feat/bridge-canonical-20261105")), true);
  assert.equal(safeEntry(entry("docs/flow-contract")), true);
  for (const value of [
    "release/v1.1.2", "main", "v1", "fix/../escape",
    "fix//branch", "feat/branch/", "-delete", "fix/evil?arg"
  ]) {
    assert.equal(safeEntry(entry(value)), false, value);
  }
  assert.equal(safeEntry({ ...entry("fix/valid"), expectedHeadSha: "short" }), false);
  assert.equal(safeEntry({ ...entry("fix/valid"), proofCommitSha: "not-a-commit" }), false);
  assert.equal(safeEntry({ ...entry("fix/valid"), pr: null }), false);
});

test("cleanup is dry-run by default and requires an explicit Nexus checkout", () => {
  assert.throws(() => parsePrune([]), /--nexus/);
  const opts = parsePrune(["--nexus=../nexus"]);
  assert.equal(opts.apply, false);
  assert.equal(parsePrune(["--nexus=../nexus", "--apply"]).apply, true);
  assert.throws(() => parsePrune(["--nexus=../nexus", "--delete-all"]), /Unsupported/);
});

test("all cleanup candidates are whitelisted, unique, versioned, and proof-bound", () => {
  const file = path.resolve(__dirname, "../docs/release/p0-branch-prune.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.projects.maestro.releaseBranch, "release/v1.1.2");
  assert.equal(manifest.projects.nexus.releaseBranch, "release/v1.0.0-beta.12");
  for (const [name, project] of Object.entries(manifest.projects)) {
    const names = project.branches.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length, name);
    assert.ok(names.length > 0);
    assert.ok(project.branches.every(safeEntry), name);
  }
});

test("smoke is portable, synthetic, and never silently enables real provider dispatch", () => {
  const local = parseQa([]);
  assert.equal(local.capture, false);
  assert.equal(local.full, false);
  assert.equal(local.nexus, null);
  assert.deepEqual(qaTests(local, "/maestro").map((row) => row[0]),
    ["release-tools", "maestro-runs", "maestro-bridge"]);
  assert.throws(() => parseQa(["--capture"]), /requires --nexus/);
  assert.throws(() => parseQa(["--unknown"]), /Unsupported/);
  const options = parseQa(["--nexus=../nexus", "--capture", "--full"]);
  const steps = qaTests(options, "/maestro").map((row) => row[0]);
  assert.ok(steps.includes("nexus-version"));
  assert.ok(steps.includes("nexus-work"));
  assert.ok(steps.includes("nexus-capture"));
  assert.ok(steps.includes("nexus-docs"));
  assert.ok(steps.includes("maestro-all"));
  assert.equal(steps.some((id) => /provider-real|runs\.submit/.test(id)), false);
});
