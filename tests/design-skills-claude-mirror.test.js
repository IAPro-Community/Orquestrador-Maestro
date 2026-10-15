"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), "utf8"));

const claudeDesignSkills = [
  "skill-open-design-ui",
  "skill-product-ux-architecture",
  "skill-impeccable",
  "skill-design-engineering-craft",
  "skill-motion-design-principles"
];

test("five design capabilities are mirrored to provider skill targets including Claude", () => {
  for (const id of claudeDesignSkills) {
    const entry = manifest.skills[id];
    assert.ok(entry, id + " must be canonical");
    assert.equal(entry.mirrorEverywhere, true, id + " must mirror to Claude and other selected targets");
  }

  const policy = JSON.parse(fs.readFileSync(path.join(root, "orquestrador", "SKILL_INSTALL_POLICY.json"), "utf8"));
  assert.equal(policy.nativeRoots?.claude?.path, ".claude/skills");

  const sh = fs.readFileSync(path.join(root, "orquestrador", "sync-skills.sh"), "utf8");
  const ps = fs.readFileSync(path.join(root, "orquestrador", "sync-skills.ps1"), "utf8");
  assert.match(sh, /mirrorEverywhere/u);
  assert.match(ps, /mirrorEverywhere/u);
});

test("external-inspired names remain aliases, not duplicate canonical skills", () => {
  const aliases = JSON.parse(fs.readFileSync(path.join(root, "orquestrador", "SKILL_ALIASES.json"), "utf8")).aliases;
  assert.equal(aliases["frontend-design"], "skill-open-design-ui");
  assert.equal(aliases["impeccable"], "skill-impeccable");
  assert.equal(aliases["ui-ux-pro-max"], "skill-product-ux-architecture");
  assert.equal(aliases["emil-design-eng"], "skill-design-engineering-craft");
  assert.equal(aliases["design-motion-principles"], "skill-motion-design-principles");

  assert.equal(Object.prototype.hasOwnProperty.call(manifest.skills, "frontend-design"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.skills, "ui-ux-pro-max"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.skills, "emil-design-eng"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.skills, "design-motion-principles"), false);
});
