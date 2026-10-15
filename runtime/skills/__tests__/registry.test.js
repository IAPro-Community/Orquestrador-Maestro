"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SkillRegistry } = require("../registry");

function writeSkill(root, relative, name) {
  const filePath = path.join(root, relative, "SKILL.md");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\nname: ${name}\n---\n`, "utf8");
}

function nativeEntry(description = "Test skill") {
  return {
    schemaVersion: 2,
    contractVersion: "1.0.0",
    origin: "maestro-core",
    maturity: "stable",
    description,
    category: "workflow",
    risk: "low",
    capabilities: ["workflow"],
    routing: { useWhen: ["test"], doNotUseWhen: [] },
    context: { required: [], useful: [], avoid: ["unrelated-domains"] },
    outputs: ["verified-result"],
    verification: { level: "light", requirements: ["verified"] },
    costProfile: { context: "low" }
  };
}

test("registry keeps source, verification, and identity separate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-skills-"));
  fs.mkdirSync(path.join(root, "orquestrador"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({ version: 3, skills: { react: nativeEntry("React") } }), "utf8");
  writeSkill(root, "orquestrador/skills/react", "react");
  writeSkill(root, "user/codex/react", "react");
  writeSkill(root, "project/.orquestrador/skills/react", "react");

  const registry = new SkillRegistry({
    maestroRoot: root,
    userSources: [{ provider: "codex", path: path.join(root, "user", "codex") }],
    projectRoot: path.join(root, "project"),
    projectSources: [path.join(root, "project", ".orquestrador", "skills")]
  });
  const skills = registry.list();
  assert.deepEqual(skills.map((skill) => skill.identity), ["maestro/react", "project/react", "user/codex/react"]);
  assert.equal(registry.get("maestro/react").verification, "maestro_verified");
  assert.equal(registry.get("user/codex/react").verification, "unverified");
});

test("default registry discovers public roots and direct user skills, never plugin caches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-discovery-root-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-discovery-home-"));
  fs.mkdirSync(path.join(root, "orquestrador", "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({ version: 3, skills: { "skill-public": nativeEntry("Public") } }), "utf8");
  writeSkill(root, "orquestrador/skills/skill-public", "skill-public");
  writeSkill(root, "skill-library/community-skills/skill-community", "skill-community");
  writeSkill(home, ".codex/skills/skill-direct", "skill-direct");
  writeSkill(home, ".codex/plugins/cache/demo/1/skills/skill-plugin", "skill-plugin");

  const registry = new SkillRegistry({
    maestroRoot: root,
    userHome: home,
    projectSources: []
  });
  const identities = registry.list().map((skill) => skill.identity);
  assert.ok(identities.includes("maestro/skill-public"));
  assert.ok(identities.includes("user/codex/skill-direct"));
  assert.ok(identities.includes("library/community/skill-community"));
  assert.ok(!identities.includes("skill-plugin"));
});


test("effective default registry resolves canonical short ids selected by the planner", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-skill-short-id-root-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-skill-short-id-home-"));
  fs.mkdirSync(path.join(root, "orquestrador", "skills"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({ version: 3, skills: { "skill-testing": nativeEntry("Testing") } }), "utf8");
  writeSkill(root, "orquestrador/skills/skill-testing", "skill-testing");

  const registry = new SkillRegistry({ maestroRoot: root, userHome: home, projectSources: [] });
  assert.equal(registry.get("skill-testing")?.identity, "maestro/skill-testing");
  assert.equal(registry.get("maestro/skill-testing")?.identity, "maestro/skill-testing");
});

test("ambiguous short ids require a namespaced identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-skill-ambiguous-root-"));
  fs.mkdirSync(path.join(root, "orquestrador"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({ version: 3, skills: { react: nativeEntry("React") } }), "utf8");
  writeSkill(root, "orquestrador/skills/react", "react");
  writeSkill(root, "user/codex/react", "react");

  const registry = new SkillRegistry({
    maestroRoot: root,
    userSources: [{ provider: "codex", path: path.join(root, "user", "codex") }],
    projectSources: []
  });
  assert.equal(registry.get("react"), null);
  assert.equal(registry.get("maestro/react")?.id, "react");
  assert.equal(registry.get("user/codex/react")?.id, "react");
});
