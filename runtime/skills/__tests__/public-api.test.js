"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const skills = require("../index");

test("skills public barrel exposes stable V1 primitives without migration internals", () => {
  assert.equal(typeof skills.SkillRegistry, "function");
  assert.equal(typeof skills.createSkillContract, "function");
  assert.equal(skills.SKILL_CONTRACT_SCHEMA_VERSION, 2);
  assert.ok(Array.isArray(skills.SKILL_CAPABILITIES));
  assert.ok(skills.SKILL_CAPABILITIES.includes("git"));
  assert.ok(skills.SKILL_CAPABILITIES.includes("ci"));
  assert.equal(typeof skills.listSkillDirectories, "function");

  for (const internal of [
    "projectLegacySkill",
    "inferOrigin",
    "inferMaturity",
    "isNativeSkillContractEntry",
    "strictStringArray",
    "uniqueStrings",
    "applyManifestDefaults",
    "readManifestDocument",
    "readManifestSkills",
    "evaluateBehaviorCase",
    "runBehaviorCases",
    "validateSkillContracts"
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(skills, internal), false, `${internal} leaked into public barrel`);
  }
});
