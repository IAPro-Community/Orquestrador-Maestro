"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { buildCatalog } = require("../scripts/public-skill-catalog");

const ROOT = path.resolve(__dirname, "..");

test("public catalog is deterministic and deduplicated", () => {
  const catalog = buildCatalog(ROOT);
  assert.equal(catalog.counts.uniqueSkills, 75);
  assert.equal(catalog.counts.sourceSkillFiles, 174);
  assert.equal(catalog.skills.length, 75);
  assert.ok(catalog.skills.every((skill) => !skill.relativePath.includes("cache")));
  assert.ok(catalog.skills.some((skill) => skill.id === "skill-melhorar-ux-ui-por-referencia"));
});

test("router exposes every public non-canonical skill", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "skill-library", "PUBLIC_SKILLS_MANIFEST.json"), "utf8"));
  const router = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILLS_ROUTER.json"), "utf8"));
  const canonical = new Set(Object.keys(router.skills || {}));
  const missing = catalog.skills.filter((skill) => !canonical.has(skill.id) && !router.librarySkills?.[skill.id]);
  assert.deepEqual(missing, []);
  assert.equal(Object.keys(router.skills || {}).length + Object.keys(router.librarySkills || {}).length, 75);
});
