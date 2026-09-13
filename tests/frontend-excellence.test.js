"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { IntentRouter } = require("../runtime/planner/intent-router.js");

const repoRoot = path.resolve(__dirname, "..");
const skillRoot = path.join(repoRoot, "orquestrador", "skills", "skill-frontend-excellence");
const scriptsRoot = path.join(skillRoot, "scripts");

test("frontend product intents route to the process owner", () => {
  const router = new IntentRouter({ maestroRoot: path.join(repoRoot, "orquestrador") });
  for (const request of ["frontend excellence", "modernize esta tela", "nova tela", "corrija o mobile", "design profile"]) {
    assert.equal(router.resolve(request).primarySkill.id, "skill-frontend-excellence", request);
  }
});

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

test("frontend intent classifier tests pass", () => {
  const result = runNode(["--test", path.join(scriptsRoot, "classify-intent.test.mjs")]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("Design Profile validator discovers the bundled neutral schema and validates YAML", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-excellence-profile-"));
  const profile = path.join(tempRoot, "design-profile.yaml");
  fs.writeFileSync(profile, [
    "version: 1",
    "product:",
    "  name: Portal",
    "  kind: portal",
    "designSystem:",
    "  provider: custom-system",
    "  metadataSource: package export",
    "design:",
    "  creativity: low",
    "  personality:",
    "    - clear",
    "    - trustworthy",
  ].join("\n"));

  const result = runNode([path.join(scriptsRoot, "validate-design-profile.mjs"), profile]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Design Profile OK/u);
});

test("Design Profile validator rejects duplicate YAML keys and schema violations", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-excellence-profile-invalid-"));
  const duplicate = path.join(tempRoot, "duplicate.yaml");
  fs.writeFileSync(duplicate, "version: 1\nversion: 1\n");
  const duplicateResult = runNode([path.join(scriptsRoot, "validate-design-profile.mjs"), duplicate]);
  assert.equal(duplicateResult.status, 1);
  assert.match(duplicateResult.stderr, /Duplicate key/u);

  const invalid = path.join(tempRoot, "invalid.json");
  fs.writeFileSync(invalid, JSON.stringify({ version: 1 }));
  const invalidResult = runNode([path.join(scriptsRoot, "validate-design-profile.mjs"), invalid]);
  assert.equal(invalidResult.status, 1);
  assert.match(invalidResult.stderr, /missing required/u);
});

test("Design Profile validator can be imported as a module", () => {
  const result = runNode([
    "--input-type=module",
    "-e",
    "import('./orquestrador/skills/skill-frontend-excellence/scripts/validate-design-profile.mjs').then(({ parseYaml }) => { if (parseYaml('version: 1').version !== 1) process.exit(1); })",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("Visual QA fixtures produce a smoke report or an explicit environment limitation", () => {
  for (const [fixture, expectedStatus] of [["good", "PASS"], ["bad", "FAIL"]]) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `frontend-excellence-visual-${fixture}-`));
    const result = runNode([
      path.join(scriptsRoot, "visual-qa.mjs"),
      "--fixture",
      fixture,
      "--out",
      tempRoot,
    ]);
    const report = JSON.parse(fs.readFileSync(path.join(tempRoot, "report.json"), "utf8"));
    if (result.status === 2) {
      assert.equal(report.status, "ENVIRONMENT_LIMITATION");
    } else {
      assert.equal(result.status, expectedStatus === "PASS" ? 0 : 1, result.stderr || result.stdout);
      assert.equal(report.verdict, expectedStatus);
    }
  }
});

test("Visual QA treats aria-labelledby references without matching nodes as unnamed", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-excellence-visual-label-"));
  const fixture = path.join(tempRoot, "label.html");
  fs.writeFileSync(fixture, "<!doctype html><html><body><button aria-labelledby=missing></button></body></html>");
  const result = runNode([
    path.join(scriptsRoot, "visual-qa.mjs"),
    "--url",
    pathToFileURL(fixture).href,
    "--out",
    tempRoot,
  ]);
  const report = JSON.parse(fs.readFileSync(path.join(tempRoot, "report.json"), "utf8"));
  if (result.status === 2) {
    assert.equal(report.status, "ENVIRONMENT_LIMITATION");
  } else {
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.ok(report.viewports.every((viewport) => viewport.hardFailures.includes("missing-accessible-name")));
  }
});

test("mirror-everywhere skill has canonical and synchronizer coverage", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "orquestrador", "SKILLS_MANIFEST.json"), "utf8"));
  const entry = manifest.skills["skill-frontend-excellence"];
  assert.equal(entry.mirrorEverywhere, true);
  assert.ok(fs.existsSync(path.join(skillRoot, "SKILL.md")));
  for (const synchronizer of ["sync-skills.sh", "sync-skills.ps1"]) {
    const body = fs.readFileSync(path.join(repoRoot, "orquestrador", synchronizer), "utf8");
    assert.match(body, /SKILLS_MANIFEST/u);
    assert.match(body, /mirrorEverywhere/u);
  }
});
