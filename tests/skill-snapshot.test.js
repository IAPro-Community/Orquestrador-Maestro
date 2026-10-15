"use strict";

// Published Codex snapshot must contain every Nativa (mirrorEverywhere)
// skill, with content identical to the canonical source.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "orquestrador", "SKILLS_MANIFEST.json"), "utf8")
);

const mirrored = Object.entries(manifest.skills || {})
  .filter(([, entry]) => entry.mirrorEverywhere === true)
  .map(([name]) => name);

test("mirrorEverywhere skills exist in published codex/skills snapshot", () => {
  assert.ok(mirrored.length > 0, "no mirrorEverywhere skills registered");
  const missing = mirrored.filter(
    name => !fs.existsSync(path.join(repoRoot, "codex", "skills", name, "SKILL.md"))
  );
  assert.deepEqual(missing, []);
});

test("codex/skills SKILL.md matches canonical source", () => {
  const stale = [];
  for (const name of mirrored) {
    const canonical = fs.readFileSync(
      path.join(repoRoot, "orquestrador", "skills", name, "SKILL.md"), "utf8"
    );
    const snapshot = fs.readFileSync(
      path.join(repoRoot, "codex", "skills", name, "SKILL.md"), "utf8"
    );
    if (canonical !== snapshot) stale.push(name);
  }
  assert.deepEqual(stale, []);
});
