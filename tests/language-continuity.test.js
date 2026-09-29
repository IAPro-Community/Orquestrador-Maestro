"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("global entrypoints preserve the user's response language", () => {
  for (const relativePath of ["orquestrador/rules.md", "home/AGENTS.md"]) {
    const content = read(relativePath);
    assert.match(content, /## Language Continuity/);
    assert.match(content, /latest substantive message/);
    assert.match(content, /tool output/);
    assert.match(content, /normalize the user-facing summary/);
  }
});

test("Codex skill cannot override language continuity", () => {
  const content = read("codex/skills/orquestrador-maestro/SKILL.md");
  assert.match(content, /Preserve the user's response language/);
  assert.match(content, /must not cause an unsolicited language switch/);
});

test("public sync restores the language continuity contract", () => {
  const content = read("scripts/sync-from-local.ps1");
  assert.match(content, /\$languageContinuityBlock/);
  assert.match(content, /-Marker "## Language Continuity"/);
  assert.match(content, /homeDest "AGENTS\.md"/);
  assert.match(content, /orchestratorDest "rules\.md"/);
});
