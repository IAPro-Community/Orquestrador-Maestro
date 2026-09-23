"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SkillRegistry } = require("../registry");

function writeSkill(root, relative, { name, description }) {
  const filePath = path.join(root, relative, "SKILL.md");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\nname: ${name}\ndescription: ${description}\n---\n`, "utf8");
}

function nativeEntry(overrides = {}) {
  return {
    schemaVersion: 2,
    contractVersion: "1.0.0",
    origin: "maestro-core",
    maturity: "stable",
    description: "Investiga bugs por evidência.",
    category: "engineering",
    risk: "medium",
    capabilities: ["debugging"],
    routing: {
      useWhen: ["bug", "regression"],
      doNotUseWhen: ["git commit mecânico"]
    },
    context: {
      required: ["failing-behavior"],
      useful: ["related-code", "related-tests", "recent-changes"],
      avoid: ["unrelated-domains"]
    },
    outputs: ["root-cause", "verified-fix"],
    verification: {
      level: "strict",
      requirements: ["causa raiz comprovada"]
    },
    costProfile: {
      context: "medium"
    },
    ...overrides
  };
}

test("registry exposes native Skill Contract V2 for canonical Maestro skills", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-contract-registry-"));
  fs.mkdirSync(path.join(root, "orquestrador", "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({
    version: 3,
    skills: {
      "skill-systematic-debugging": nativeEntry()
    }
  }), "utf8");
  writeSkill(root, "orquestrador/skills/skill-systematic-debugging", {
    name: "skill-systematic-debugging",
    description: "Investiga bugs por evidência."
  });

  const registry = new SkillRegistry({
    maestroRoot: root,
    userSources: [],
    projectSources: []
  });

  const skill = registry.get("skill-systematic-debugging");
  assert.equal(skill.schemaVersion, 2);
  assert.equal(skill.origin, "maestro-core");
  assert.equal(skill.maturity, "stable");
  assert.equal(skill.contract.compatibility.legacyProjected, false);
  assert.deepEqual(skill.contract.routing.useWhen, ["bug", "regression"]);
  assert.deepEqual(skill.contract.routing.doNotUseWhen, ["git commit mecânico"]);
  assert.equal(skill.contract.verification.level, "strict");
});

test("canonical Maestro skill fails closed when V2 metadata is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-legacy-contract-registry-"));
  fs.mkdirSync(path.join(root, "orquestrador", "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({
    version: 3,
    skills: {
      "skill-systematic-debugging": {
        description: "Legacy entry."
      }
    }
  }), "utf8");
  writeSkill(root, "orquestrador/skills/skill-systematic-debugging", {
    name: "skill-systematic-debugging",
    description: "Legacy entry."
  });

  const registry = new SkillRegistry({
    maestroRoot: root,
    userSources: [],
    projectSources: []
  });

  assert.throws(() => registry.list(), /must implement Skill Contract V2 natively/u);
});

test("project skill projection remains unverified and project-scoped", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-project-contract-"));
  const projectRoot = path.join(root, "project");
  fs.mkdirSync(path.join(root, "orquestrador"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({ version: 3, skills: {} }), "utf8");
  writeSkill(projectRoot, ".orquestrador/skills/local-helper", {
    name: "local-helper",
    description: "Project-only helper."
  });

  const registry = new SkillRegistry({
    maestroRoot: root,
    userSources: [],
    projectRoot,
    projectSources: [path.join(projectRoot, ".orquestrador", "skills")]
  });

  const skill = registry.get("project/local-helper");
  assert.equal(skill.origin, "project");
  assert.equal(skill.maturity, "experimental");
  assert.equal(skill.verification, "unverified");
  assert.equal(skill.contract.compatibility.legacyProjected, true);
  assert.equal(skill.contract.description, "Project-only helper.");
});

test("default discovery preserves native canonical manifest metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-default-contract-root-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-default-contract-home-"));
  fs.mkdirSync(path.join(root, "orquestrador", "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({
    version: 3,
    skills: {
      "skill-systematic-debugging": nativeEntry()
    }
  }), "utf8");
  writeSkill(root, "orquestrador/skills/skill-systematic-debugging", {
    name: "skill-systematic-debugging",
    description: "Investiga bugs por evidência."
  });

  const registry = new SkillRegistry({
    maestroRoot: root,
    userHome: home,
    projectSources: []
  });

  const skill = registry.get("skill-systematic-debugging");
  assert.equal(skill.origin, "maestro-core");
  assert.equal(skill.contract.risk, "medium");
  assert.deepEqual(skill.contract.capabilities, ["debugging"]);
  assert.deepEqual(skill.contract.routing.useWhen, ["bug", "regression"]);
});

test("installed layout can load native V2 manifest from Maestro root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-installed-contract-root-"));
  fs.mkdirSync(path.join(root, "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, "SKILLS_MANIFEST.json"), JSON.stringify({
    version: 3,
    skills: {
      "skill-installed": nativeEntry({
        description: "Installed skill.",
        category: "workflow",
        risk: "low",
        capabilities: ["workflow"],
        routing: {
          useWhen: ["installed"],
          doNotUseWhen: []
        },
        context: {
          required: [],
          useful: [],
          avoid: ["unrelated-domains"]
        },
        outputs: ["verified-result"],
        verification: {
          level: "light",
          requirements: ["installed result verified"]
        },
        costProfile: {
          context: "low"
        }
      })
    }
  }), "utf8");
  writeSkill(root, "skills/skill-installed", {
    name: "skill-installed",
    description: "Installed skill."
  });

  const registry = new SkillRegistry({
    maestroRoot: root,
    userSources: [],
    projectSources: []
  });

  const skill = registry.get("skill-installed");
  assert.equal(skill.origin, "maestro-core");
  assert.deepEqual(skill.contract.routing.useWhen, ["installed"]);
});

test("registry fails closed when canonical manifest is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-invalid-manifest-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-invalid-home-"));
  fs.mkdirSync(path.join(root, "orquestrador", "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), "{ invalid json", "utf8");

  const registry = new SkillRegistry({
    maestroRoot: root,
    userHome: home,
    projectSources: []
  });

  assert.throws(() => registry.list(), /Invalid skill manifest/u);
});
