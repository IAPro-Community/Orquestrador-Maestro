"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

test("1.1.0: deprecated open-code aliases exist as shims with redirect", () => {
  for (const [skill, redirect] of [
    ["skill-open-code-review", "code-review"],
    ["skill-open-code-delegate", "skill-multiagent-orchestration"],
  ]) {
    const p = path.join(ROOT, "orquestrador", "skills", skill, "SKILL.md");
    assert.ok(fs.existsSync(p), `${skill} shim must exist`);
    const body = fs.readFileSync(p, "utf8");
    assert.match(body, /deprecated/i);
    assert.match(body, new RegExp(redirect.replace(/-/g, "-")));
  }
});

test("1.1.0: manifest + router register deprecated aliases", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILLS_MANIFEST.json"), "utf8"));
  const router = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILLS_ROUTER.json"), "utf8"));
  for (const skill of ["skill-open-code-review", "skill-open-code-delegate"]) {
    assert.ok(manifest.skills[skill], `manifest must contain ${skill}`);
    assert.equal(manifest.skills[skill].deprecated, true);
    assert.ok(manifest.skills[skill].redirect, `${skill} must have redirect`);
    assert.equal(manifest.skills[skill].mirrorEverywhere, false);
    assert.ok(router.skills[skill], `router must contain ${skill}`);
    assert.equal(router.skills[skill].deprecated, true);
  }
  assert.equal(manifest.skills["skill-open-code-review"].redirect, "code-review");
  assert.equal(manifest.skills["skill-open-code-delegate"].redirect, "skill-multiagent-orchestration");
});

test("1.1.0: redirect targets are real packaged skills", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "codex", "skills", "code-review", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(ROOT, "orquestrador", "skills", "skill-multiagent-orchestration", "SKILL.md")));
});
