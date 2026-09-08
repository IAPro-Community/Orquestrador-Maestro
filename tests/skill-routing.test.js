"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { IntentRouter } = require("../runtime/planner/intent-router.js");

const repoRoot = path.resolve(__dirname, "..");

test("native planning workflows are mirrored to every supported client", () => {
  const policy = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "orquestrador", "SKILL_INSTALL_POLICY.json"),
    "utf8"
  ));
  const required = ["plan", "ralplan", "ralph", "team", "ultrawork", "deep-interview"];

  for (const [program, target] of Object.entries(policy.nativeRoots)) {
    for (const skill of required) {
      assert.ok(
        target.allowDirectories.includes(skill),
        `${program} must allow the ${skill} workflow mirror`
      );
    }
  }
});

test("ralplan and plan are real packaged skill bodies", () => {
  for (const skill of ["plan", "ralplan"]) {
    const skillPath = path.join(repoRoot, "codex", "skills", skill, "SKILL.md");
    const body = fs.readFileSync(skillPath, "utf8");
    assert.match(body, new RegExp(`^name: ${skill}$`, "m"));
    assert.ok(body.trim().length > 100, `${skill} must not be a placeholder`);
  }
});

test("watch evidence routes observation requests without stealing media pipeline routes", () => {
  const router = new IntentRouter({ maestroRoot: path.join(repoRoot, "orquestrador") });

  const watched = router.resolve("watch-skill assistir vídeo e citar a evidência temporal");
  assert.equal(watched.primarySkill.id, "skill-watch-evidence");

  const pipeline = router.resolve("construir uma pipeline de live video com fila de video");
  assert.equal(pipeline.primarySkill.id, "skill-live-processing");

  const chained = router.resolve("watch-skill e depois fazer clip detection");
  assert.equal(chained.primarySkill.id, "skill-watch-evidence");
  assert.ok(
    chained.chainedSkills.some((skill) => skill.id === "skill-smart-clip-detection"),
    "watch evidence may chain to smart clip detection when the request asks for clips"
  );
});
