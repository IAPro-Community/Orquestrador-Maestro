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

test("registry keeps source, verification, and identity separate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-skills-"));
  fs.mkdirSync(path.join(root, "orquestrador"), { recursive: true });
  fs.writeFileSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"), JSON.stringify({ skills: { react: {} } }), "utf8");
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
