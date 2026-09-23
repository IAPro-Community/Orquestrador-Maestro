"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SKILL_CAPABILITIES,
  SKILL_CONTRACT_SCHEMA_VERSION,
  createCanonicalSkillContract,
  createSkillContract,
  projectLegacySkill
} = require("../contract-v2");

function validContract(overrides = {}) {
  return {
    id: "skill-git-workflow",
    version: "1.0.0",
    origin: "maestro-core",
    maturity: "stable",
    description: "Operações Git do dia a dia.",
    category: "developer",
    risk: "medium",
    capabilities: ["git"],
    routing: {
      useWhen: ["git commit", "resolver conflito"],
      doNotUseWhen: ["revisar arquitetura"]
    },
    context: {
      required: ["git-status"],
      useful: ["git-diff"],
      avoid: ["unrelated-project-history"]
    },
    outputs: ["verified-git-operation"],
    verification: {
      level: "standard",
      requirements: ["git status"]
    },
    costProfile: {
      context: "minimal"
    },
    compatibility: {
      legacyProjected: false
    },
    ...overrides
  };
}

function nativeEntry(overrides = {}) {
  const contract = validContract();
  return {
    schemaVersion: 2,
    contractVersion: contract.version,
    origin: contract.origin,
    maturity: contract.maturity,
    description: contract.description,
    category: contract.category,
    risk: contract.risk,
    capabilities: contract.capabilities,
    routing: contract.routing,
    context: contract.context,
    outputs: contract.outputs,
    verification: contract.verification,
    costProfile: contract.costProfile,
    ...overrides
  };
}

test("creates a strict Skill Contract V2", () => {
  const contract = createSkillContract(validContract());

  assert.equal(contract.schemaVersion, SKILL_CONTRACT_SCHEMA_VERSION);
  assert.deepEqual(contract.capabilities, ["git"]);
  assert.deepEqual(contract.routing.doNotUseWhen, ["revisar arquitetura"]);
  assert.deepEqual(contract.context.required, ["git-status"]);
  assert.equal(contract.compatibility.legacyProjected, false);
  assert.ok(Object.isFrozen(contract));
  assert.ok(Object.isFrozen(contract.routing));
});

test("developer-core capabilities are part of the stable taxonomy", () => {
  for (const capability of [
    "git",
    "issue-resolution",
    "pull-request",
    "ci",
    "refactoring",
    "api-design",
    "performance",
    "containers",
    "kubernetes",
    "build-tooling",
    "developer-environment",
    "legacy-modernization"
  ]) {
    assert.ok(SKILL_CAPABILITIES.includes(capability), `missing capability ${capability}`);
  }
});

test("strict contract rejects missing schema-required structures", () => {
  assert.throws(() => createSkillContract({
    id: "skill-example",
    version: "1.0.0",
    origin: "maestro-core",
    maturity: "stable",
    description: "Example",
    category: "developer",
    risk: "low"
  }), /routing|capabilities/u);
});

test("generic V2 contract accepts provider-specific external capabilities", () => {
  const contract = createSkillContract(validContract({
    origin: "external",
    capabilities: ["provider-specific-capability"],
    compatibility: { legacyProjected: true }
  }));
  assert.deepEqual(contract.capabilities, ["provider-specific-capability"]);
});

test("canonical Maestro contract rejects capabilities outside the V1 taxonomy", () => {
  assert.throws(() => createCanonicalSkillContract("skill-custom", nativeEntry({
    capabilities: ["provider-specific-capability"]
  })), /must implement Skill Contract V2 natively/u);
});

test("rejects duplicate entries instead of silently normalizing native V2", () => {
  assert.throws(() => createSkillContract(validContract({
    capabilities: ["git", "git"]
  })), /must be unique/u);
});

test("rejects non-string entries instead of silently dropping them", () => {
  assert.throws(() => createSkillContract(validContract({
    outputs: ["ok", 123]
  })), /non-empty strings/u);
});

test("rejects contradictory positive and negative routing", () => {
  assert.throws(() => createSkillContract(validContract({
    routing: {
      useWhen: ["Git Commit"],
      doNotUseWhen: ["git commit"]
    }
  })), /overlap/u);
});

test("canonical Maestro skill must be native V2", () => {
  const contract = createCanonicalSkillContract("skill-git-workflow", nativeEntry());
  assert.equal(contract.compatibility.legacyProjected, false);
  assert.equal(contract.origin, "maestro-core");
  assert.deepEqual(contract.capabilities, ["git"]);
});

test("canonical Maestro skill rejects partial or legacy metadata", () => {
  assert.throws(() => createCanonicalSkillContract("skill-partial", {
    schemaVersion: 2,
    description: "Partial migration",
    category: "engineering",
    origin: "maestro-core",
    maturity: "stable",
    risk: "low"
  }), /must implement Skill Contract V2 natively/u);
});

test("legacy projection is forbidden for Maestro namespace", () => {
  assert.throws(() => projectLegacySkill({
    id: "skill-systematic-debugging",
    namespace: "maestro",
    source: "maestro",
    entry: {
      description: "Legacy Maestro skill."
    }
  }), /cannot use legacy projection/u);
});

test("public catalog membership does not implicitly promote external skills to stable", () => {
  const contract = projectLegacySkill({
    id: "third-party-catalog-skill",
    namespace: "library/community",
    source: "library",
    verification: "public_catalog",
    description: "Catalogued third-party skill"
  });

  assert.equal(contract.origin, "external");
  assert.equal(contract.maturity, "experimental");
  assert.equal(contract.compatibility.legacyProjected, true);
});

test("user and project skills remain compatible without Maestro V2 metadata", () => {
  const user = projectLegacySkill({
    id: "third-party-skill",
    namespace: "user/codex",
    source: "user",
    verification: "unverified",
    description: "Third party skill"
  });
  const project = projectLegacySkill({
    id: "local-helper",
    namespace: "project",
    source: "project",
    verification: "unverified",
    description: "Project helper"
  });

  assert.equal(user.origin, "user");
  assert.equal(project.origin, "project");
  assert.equal(user.maturity, "experimental");
  assert.equal(project.maturity, "experimental");
  assert.equal(user.compatibility.legacyProjected, true);
  assert.equal(project.compatibility.legacyProjected, true);
});


test("external compatibility ignores foreign metadata instead of rejecting the skill", () => {
  const contract = projectLegacySkill({
    id: "foreign-helper",
    namespace: "project",
    source: "project",
    verification: "unverified",
    description: "Foreign project helper",
    entry: {
      capabilities: ["vendor-custom-capability", "testing"],
      routing: {
        useWhen: ["foreign helper"],
        doNotUseWhen: ["foreign helper", "other task"]
      },
      verification: {
        level: "vendor-strict",
        requirements: ["vendor proof"]
      },
      costProfile: {
        context: "vendor-large"
      }
    }
  });

  assert.deepEqual(contract.capabilities, ["testing"]);
  assert.deepEqual(contract.routing.useWhen, ["foreign helper"]);
  assert.deepEqual(contract.routing.doNotUseWhen, ["other task"]);
  assert.equal(contract.verification.level, "unknown");
  assert.equal(contract.costProfile.context, "unknown");
  assert.equal(contract.compatibility.legacyProjected, true);
});
