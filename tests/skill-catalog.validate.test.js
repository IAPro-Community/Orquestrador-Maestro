"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { makeTempDir, writeFile } = require("./test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const sourceScriptPath = path.join(repoRoot, "scripts", "skill-catalog.js");

function makeCatalogFixture({ routerSkills, skillText }) {
  const root = makeTempDir("orquestrador-skill-catalog-");
  writeFile(root, "scripts/skill-catalog.js", fs.readFileSync(sourceScriptPath, "utf8"));
  writeFile(root, "orquestrador/SKILLS_MANIFEST.json", JSON.stringify({
    version: 1,
    purpose: "test manifest",
    skills: {
      "skill-phase-router": {
        description: "Validate phase router coverage.",
        category: "workflow",
        risk: "medium",
        source: "test",
        status: "canonical"
      }
    }
  }, null, 2));
  writeFile(root, "orquestrador/SKILLS_ROUTER.json", JSON.stringify({
    skills: routerSkills
  }, null, 2));
  writeFile(root, "orquestrador/SKILL_ALIASES.json", JSON.stringify({ aliases: {} }, null, 2));
  writeFile(root, "orquestrador/SKILL_CHAINS.json", JSON.stringify({ chains: {} }, null, 2));
  writeFile(root, "orquestrador/skills/skill-phase-router/SKILL.md", skillText);
  return root;
}

test("skill-catalog validate fails when a manifest skill has no router entry", () => {
  const fixtureRoot = makeCatalogFixture({
    routerSkills: {},
    skillText: [
      "---",
      "name: skill-phase-router",
      "description: Validate phase router coverage.",
      "category: workflow",
      "risk: medium",
      "source: test",
      "---",
      "",
      "# Skill",
      "",
      "Stable content."
    ].join("\n")
  });

  const result = spawnSync(process.execPath, [
    path.join(fixtureRoot, "scripts", "skill-catalog.js"),
    "validate"
  ], {
    cwd: fixtureRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /router:skill-phase-router: missing router entry/u);
});

test("skill-catalog validate fails when a skill file contains mojibake", () => {
  const fixtureRoot = makeCatalogFixture({
    routerSkills: {
      "skill-phase-router": {
        description: "Validate phase router coverage.",
        triggers: ["phase router"],
        canonicalPath: "{{USER_HOME}}/.orquestrador/skills/skill-phase-router/SKILL.md",
        codexPath: "{{USER_HOME}}/.codex/skills/skill-phase-router/SKILL.md",
        cost: "medium",
        safety: "task-specific-guardrails"
      }
    },
    skillText: [
      "---",
      "name: skill-phase-router",
      "description: Validate phase router coverage.",
      "category: workflow",
      "risk: medium",
      "source: test",
      "---",
      "",
      "# Skill",
      "",
      "Pr" + String.fromCodePoint(0xC3, 0xB3) + "xima fase do workflow."
    ].join("\n")
  });

  const result = spawnSync(process.execPath, [
    path.join(fixtureRoot, "scripts", "skill-catalog.js"),
    "validate"
  ], {
    cwd: fixtureRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /skills\/skill-phase-router\/SKILL\.md: possible mojibake/u);
});
