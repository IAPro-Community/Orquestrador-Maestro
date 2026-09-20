"use strict";

// Guard against product narrative drift: the canonical capability matrix must
// stay consistent with the manifests, providers and files it references.
// Source of truth: docs/product/CAPABILITY_MATRIX.json (code wins on conflict).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const matrixPath = path.join(repoRoot, "docs", "product", "CAPABILITY_MATRIX.json");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));

function repoExists(p) {
  // Evidence entries may carry " (notes)" suffix or line anchors; strip them.
  const clean = String(p).split(" (")[0].trim();
  return fs.existsSync(path.join(repoRoot, clean));
}

test("matrix has schemaVersion 1 and required sections", () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.ok(Array.isArray(matrix.capabilities) && matrix.capabilities.length > 0);
  assert.ok(Array.isArray(matrix.tools) && matrix.tools.length > 0);
  assert.ok(Array.isArray(matrix.runtimeProviders) && matrix.runtimeProviders.length > 0);
});

test("capability status uses known enum", () => {
  const allowed = new Set(matrix.enums?.capabilityStatus || ["stable", "experimental", "planned"]);
  for (const cap of matrix.capabilities) {
    assert.ok(allowed.has(cap.status), `${cap.id}: unknown status ${cap.status}`);
    assert.equal(typeof cap.publicClaimAllowed, "boolean", `${cap.id}: publicClaimAllowed must be boolean`);
  }
});

test("ids are unique", () => {
  const capIds = matrix.capabilities.map((c) => c.id);
  const toolIds = matrix.tools.map((t) => t.id);
  assert.equal(new Set(capIds).size, capIds.length, "duplicate capability id");
  assert.equal(new Set(toolIds).size, toolIds.length, "duplicate tool id");
});

test("skill counts derive from canonical manifests", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "orquestrador", "SKILLS_MANIFEST.json"), "utf8")
  );
  const skillCount = Object.keys(manifest.skills || {}).length;
  assert.ok(skillCount > 0, "manifest has no skills");
  assert.match(matrix.sources.skillsManifest, new RegExp(`${skillCount} skills`));
});

test("runtimeProviders match provider adapters on disk", () => {
  const adapters = fs
    .readdirSync(path.join(repoRoot, "runtime", "providers"))
    .filter((f) => f.endsWith("-adapter.js") && f !== "provider-adapter.js")
    .map((f) => f.replace("-adapter.js", ""))
    .sort();
  assert.deepEqual([...matrix.runtimeProviders].sort(), adapters);
});

test("every runtimeProvider tool has existing runtime evidence", () => {
  for (const tool of matrix.tools.filter((t) => t.runtimeProvider)) {
    assert.ok(
      tool.runtimeEvidence && tool.runtimeEvidence.length > 0,
      `${tool.id}: runtimeProvider without runtimeEvidence`
    );
    for (const evidence of tool.runtimeEvidence) {
      assert.ok(repoExists(evidence), `${tool.id}: missing runtime evidence ${evidence}`);
    }
    assert.ok(
      matrix.runtimeProviders.includes(tool.id),
      `${tool.id}: runtimeProvider not listed in runtimeProviders`
    );
  }
});

test("no tool claims runtimeProvider without an adapter file", () => {
  for (const tool of matrix.tools) {
    if (!tool.runtimeProvider) continue;
    const adapter = path.join(repoRoot, "runtime", "providers", `${tool.id}-adapter.js`);
    assert.ok(fs.existsSync(adapter), `${tool.id}: claims runtimeProvider but ${adapter} is missing`);
  }
});

test("implementation evidence paths exist", () => {
  const missing = [];
  for (const cap of matrix.capabilities) {
    for (const evidence of cap.implementationEvidence || []) {
      if (!repoExists(evidence)) missing.push(`${cap.id}: ${evidence}`);
    }
  }
  assert.deepEqual(missing, []);
});
