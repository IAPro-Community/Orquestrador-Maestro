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
  // Evidence entries may carry " (notes)" suffixes, command args, or line anchors; strip them.
  const clean = String(p).split(" (")[0].split(/\s+(?:validate|check|run)\b/)[0].trim();
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

test("skill counts derive from canonical manifests (no hardcoded drift)", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "orquestrador", "SKILLS_MANIFEST.json"), "utf8")
  );
  const router = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "orquestrador", "SKILLS_ROUTER.json"), "utf8")
  );
  const manifestCount = Object.keys(manifest.skills || {}).length;
  const routerCount = Object.keys(router.skills || {}).length;
  assert.ok(manifestCount > 0, "manifest has no skills");
  assert.equal(routerCount, manifestCount, `router skills (${routerCount}) != manifest skills (${manifestCount})`);
  // sources must reference files, not hardcoded counts
  for (const [key, ref] of Object.entries(matrix.sources || {})) {
    if (key === "note") continue;
    assert.ok(repoExists(ref), `sources.${key}: missing file ${ref}`);
    assert.ok(!/\d+\s+(skills|programs|adapters|profiles|workflows|capabilityRoutes)/.test(String(ref)),
      `sources.${key}: hardcoded count in reference ${ref}`);
  }
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

test("taxonomy invariant: runtimeProvider => integrated => compatible", () => {
  for (const tool of matrix.tools) {
    if (tool.runtimeProvider) {
      assert.ok(tool.integrated, `${tool.id}: runtimeProvider requires integrated`);
    }
    if (tool.integrated) {
      assert.ok(tool.compatible, `${tool.id}: integrated requires compatible`);
    }
  }
});

test("testEvidence paths exist", () => {
  const missing = [];
  for (const cap of matrix.capabilities) {
    for (const evidence of cap.testEvidence || []) {
      if (!repoExists(evidence)) missing.push(`${cap.id}: ${evidence}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("documentation paths exist", () => {
  const missing = [];
  for (const cap of matrix.capabilities) {
    for (const doc of cap.documentation || []) {
      if (!repoExists(doc)) missing.push(`${cap.id}: ${doc}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("integrationEvidence paths exist", () => {
  const missing = [];
  for (const cap of matrix.capabilities) {
    for (const evidence of cap.integrationEvidence || []) {
      if (!repoExists(evidence)) missing.push(`${cap.id}: ${evidence}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("tool runtimeProvider count matches adapter files", () => {
  const runtimeTools = matrix.tools.filter((t) => t.runtimeProvider);
  assert.equal(runtimeTools.length, matrix.runtimeProviders.length,
    `tool runtimeProvider count (${runtimeTools.length}) != runtimeProviders length (${matrix.runtimeProviders.length})`);
});

test("runtimeProviders array has no duplicates", () => {
  assert.equal(new Set(matrix.runtimeProviders).size, matrix.runtimeProviders.length,
    "duplicate entries in runtimeProviders");
});

test("taxonomy invariant is documented in enums", () => {
  assert.equal(matrix.enums?.taxonomyInvariant, "runtimeProvider => integrated => compatible",
    "enums.taxonomyInvariant must declare runtimeProvider => integrated => compatible");
});

test("tool entrypoints reference existing PROGRAM_ENTRYPOINTS/TOOL_ADAPTERS ids", () => {
  const programs = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "orquestrador", "PROGRAM_ENTRYPOINTS.json"), "utf8")
  );
  const adapters = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "orquestrador", "TOOL_ADAPTERS.json"), "utf8")
  );
  const programIds = new Set(Object.keys(programs.programs || {}));
  const adapterIds = new Set(Object.keys(adapters.adapters || {}));
  const missing = [];
  for (const tool of matrix.tools) {
    for (const entry of tool.entrypoints || []) {
      const mProg = String(entry).match(/PROGRAM_ENTRYPOINTS\.json:\s*programs\.([A-Za-z0-9_-]+)/);
      if (mProg && !programIds.has(mProg[1])) missing.push(`${tool.id}: unknown program ${mProg[1]}`);
      const mAd = String(entry).match(/TOOL_ADAPTERS\.json:\s*adapters\.([A-Za-z0-9_-]+)/);
      if (mAd && !adapterIds.has(mAd[1])) missing.push(`${tool.id}: unknown adapter ${mAd[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("no hardcoded manual counts in capability notes", () => {
  const bad = [];
  const countRe = /\b(51 skills|4 providers|11 programs|9 adapters|13 cen[aá]rios|13 scenarios)\b/i;
  for (const cap of matrix.capabilities) {
    for (const field of ["notes", ...(cap.implementationEvidence || []), ...(cap.testEvidence || [])]) {
      if (typeof field === "string" && countRe.test(field)) bad.push(`${cap.id}: ${field}`);
    }
  }
  assert.deepEqual(bad, []);
});
