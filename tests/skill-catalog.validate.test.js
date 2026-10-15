"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { makeTempDir, writeFile } = require("./test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const sourceScriptPath = path.join(repoRoot, "scripts", "skill-catalog.js");
const sourceContractPath = path.join(repoRoot, "runtime", "skills", "contract-v2.js");

function makeCatalogFixture({ routerSkills, skillText }) {
  const root = makeTempDir("orquestrador-skill-catalog-");
  writeFile(root, "scripts/skill-catalog.js", fs.readFileSync(sourceScriptPath, "utf8"));
  writeFile(root, "runtime/skills/contract-v2.js", fs.readFileSync(sourceContractPath, "utf8"));
  writeFile(root, "orquestrador/SKILLS_MANIFEST.json", JSON.stringify({
    version: 3,
    purpose: "test manifest",
    skills: {
      "skill-phase-router": {
        description: "Validate phase router coverage.",
        category: "workflow",
        risk: "medium",
        source: "test",
        mirrorEverywhere: false,
        aliases: [],
        tags: ["workflow", "phase-router"],
        routerSummary: "Validate phase router coverage.",
        documentation: {
          bestFor: ["Validate phase router coverage."],
          examples: ["Use para phase router."],
          prerequisites: []
        },
        provenance: {
          evidence: ["orquestrador/skills/skill-phase-router/SKILL.md"],
          steward: "test",
          reviewedAt: "2026-09-22",
          upstream: "test",
          version: "test",
          license: "test"
        },
        schemaVersion: 2,
        contractVersion: "1.0.0",
        origin: "maestro-core",
        maturity: "stable",
        capabilities: ["workflow"],
        routing: {
          useWhen: ["phase router"],
          doNotUseWhen: []
        },
        context: {
          required: [],
          useful: [],
          avoid: ["unrelated-domains"]
        },
        outputs: ["verified-result"],
        verification: {
          level: "standard",
          requirements: ["verified"]
        },
        costProfile: {
          context: "medium"
        }
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

test("skill-catalog generate is deterministic and check detects stale reference pages", () => {
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
      "Stable content."
    ].join("\n")
  });
  const script = path.join(fixtureRoot, "scripts", "skill-catalog.js");
  const generated = spawnSync(process.execPath, [script, "generate"], { cwd: fixtureRoot, encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);
  const first = fs.readFileSync(path.join(fixtureRoot, "docs", "skills", "reference", "skill-phase-router.md"), "utf8");
  const regenerated = spawnSync(process.execPath, [script, "generate"], { cwd: fixtureRoot, encoding: "utf8" });
  assert.equal(regenerated.status, 0, regenerated.stderr);
  const second = fs.readFileSync(path.join(fixtureRoot, "docs", "skills", "reference", "skill-phase-router.md"), "utf8");
  assert.equal(first, second);

  fs.appendFileSync(path.join(fixtureRoot, "docs", "skills", "reference", "skill-phase-router.md"), "\nchanged\n", "utf8");
  const checked = spawnSync(process.execPath, [script, "check"], { cwd: fixtureRoot, encoding: "utf8" });
  assert.equal(checked.status, 1);
  assert.match(checked.stderr.replace(/\\/gu, "/"), /generated:docs\/skills\/reference\/skill-phase-router\.md: stale/u);
});


test("skill-catalog validate accepts a generated native V3 catalog", () => {
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
      "Stable content."
    ].join("\n")
  });
  const script = path.join(fixtureRoot, "scripts", "skill-catalog.js");
  const generated = spawnSync(process.execPath, [script, "generate"], { cwd: fixtureRoot, encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);

  const validated = spawnSync(process.execPath, [script, "validate"], { cwd: fixtureRoot, encoding: "utf8" });
  assert.equal(validated.status, 0, validated.stderr);
});

test("skill-catalog validate rejects deprecated canonical routing fields", () => {
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
      "Stable content."
    ].join("\n")
  });

  const manifestPath = path.join(fixtureRoot, "orquestrador", "SKILLS_MANIFEST.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.skills["skill-phase-router"].triggers = ["phase router"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const result = spawnSync(process.execPath, [
    path.join(fixtureRoot, "scripts", "skill-catalog.js"),
    "validate"
  ], {
    cwd: fixtureRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /deprecated field triggers/u);
});
