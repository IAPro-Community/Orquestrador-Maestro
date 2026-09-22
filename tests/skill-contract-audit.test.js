"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { auditContracts } = require("../scripts/skill-contract-audit");

function writeSkill(root, relative, name, body) {
  const directory = path.join(root, relative, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: Example\n---\n\n${body}\n`,
    "utf8"
  );
}

function nativeEntry(overrides = {}) {
  return {
    schemaVersion: 2,
    contractVersion: "1.0.0",
    origin: "maestro-core",
    maturity: "stable",
    description: "Example",
    category: "engineering",
    risk: "low",
    capabilities: ["engineering"],
    routing: {
      useWhen: ["example"],
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
      context: "low"
    },
    ...overrides
  };
}

test("contract audit recomputes public conflicts from source state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-contract-audit-"));
  fs.mkdirSync(path.join(root, "orquestrador"), { recursive: true });
  fs.mkdirSync(path.join(root, "skill-library"), { recursive: true });

  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({
    version: 3,
    skills: {
      "skill-example": nativeEntry()
    }
  }), "utf8");

  writeSkill(root, "orquestrador/skills", "skill-example", "canonical");
  writeSkill(root, "skill-library/community-skills", "skill-example", "conflicting mirror");

  fs.writeFileSync(path.join(root, "skill-library", "PUBLIC_SKILLS_MANIFEST.json"), JSON.stringify({
    schemaVersion: 1,
    source: "repository-public-sources",
    identity: "frontmatter.name normalized to skill id",
    precedence: ["maestro", "codex", "community"],
    counts: {
      uniqueSkills: 1,
      sourceSkillFiles: 2,
      shadowedDuplicates: 1,
      conflictingIds: 0
    },
    skills: [],
    conflicts: []
  }), "utf8");

  const result = auditContracts(root);
  assert.equal(result.canonicalSkills, 1);
  assert.equal(result.nativeCanonicalSkills, 1);
  assert.equal(result.nonNativeCanonicalSkills, 0);
  assert.equal(result.publicCatalog.conflictingIds, 1);
  assert.equal(result.publicCatalog.stale, true);
  assert.equal(result.migrationScope, "maestro-canonical-skills");
  assert.equal(result.externalCompatibilityScope, "external-user-project-skills");
  assert.equal(result.migrationReady, false);
  assert.ok(result.migrationBlockers.includes("PUBLIC_ID_CONFLICTS_REMAIN"));
  assert.ok(result.migrationBlockers.includes("PUBLIC_CATALOG_STALE"));
});

test("contract audit reports non-native Maestro entries instead of projecting them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-contract-audit-native-"));
  fs.mkdirSync(path.join(root, "orquestrador"), { recursive: true });
  fs.mkdirSync(path.join(root, "skill-library"), { recursive: true });

  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({
    version: 3,
    skills: {
      "skill-example": {
        description: "Legacy canonical entry."
      }
    }
  }), "utf8");

  const result = auditContracts(root);
  assert.equal(result.canonicalSkills, 1);
  assert.equal(result.nativeCanonicalSkills, 0);
  assert.equal(result.nonNativeCanonicalSkills, 1);
  assert.equal(result.migrationReady, false);
  assert.ok(result.migrationBlockers.includes("NON_NATIVE_CANONICAL_SKILLS"));
  assert.ok(result.issues.some((issue) => issue.code === "NON_NATIVE_CANONICAL_SKILL"));
});

test("contract audit blocks readiness when canonical or public manifests are missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-contract-audit-missing-"));
  fs.mkdirSync(path.join(root, "orquestrador", "skills"), { recursive: true });
  fs.mkdirSync(path.join(root, "skill-library", "community-skills"), { recursive: true });

  const result = auditContracts(root);
  assert.equal(result.canonicalManifestPersisted, false);
  assert.equal(result.publicCatalog.persisted, false);
  assert.equal(result.migrationReady, false);
  assert.ok(result.migrationBlockers.includes("CANONICAL_MANIFEST_MISSING"));
  assert.ok(result.migrationBlockers.includes("PUBLIC_CATALOG_MISSING"));
});

test("contract audit rejects a canonical manifest outside V3", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-contract-audit-version-"));
  fs.mkdirSync(path.join(root, "orquestrador"), { recursive: true });
  fs.mkdirSync(path.join(root, "skill-library"), { recursive: true });

  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({
    version: 2,
    skills: {
      "skill-example": nativeEntry()
    }
  }), "utf8");

  const result = auditContracts(root);
  assert.equal(result.canonicalManifestVersion, 2);
  assert.equal(result.migrationReady, false);
  assert.ok(result.migrationBlockers.includes("CANONICAL_MANIFEST_VERSION_INVALID"));
});
