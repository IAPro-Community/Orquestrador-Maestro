"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("rules keep the canonical response-language policy", () => {
  const content = read("orquestrador/rules.md");
  assert.match(content, /## Language Continuity/);
  assert.match(content, /latest substantive user message/);
  assert.match(content, /Do not infer response language/);
  assert.match(content, /user-facing prose and summaries/);
});

test("AGENTS keeps only a compact pointer to the canonical policy", () => {
  const content = read("home/AGENTS.md");
  assert.match(content, /## Language Continuity/);
  assert.match(content, /canonical policy is/);
  assert.match(content, /repository or tool language must not override it/);
  assert.doesNotMatch(content, /latest substantive user message/);
});

test("Codex skill relies on the canonical rules instead of duplicating language policy", () => {
  const content = read("codex/skills/orquestrador-maestro/SKILL.md");
  assert.match(content, /Apply the hierarchy `rules -> maestro -> local AGENTS`/);
  assert.doesNotMatch(content, /unsolicited language switch/);
});

test("public sync emits full rules plus a compact AGENTS reference", () => {
  const content = read("scripts/sync-from-local.ps1");
  assert.match(content, /\$languageContinuityBlock/);
  assert.match(content, /\$languageContinuityReferenceBlock/);
  assert.match(content, /homeDest "AGENTS\.md".*languageContinuityReferenceBlock/);
  assert.match(content, /orchestratorDest "rules\.md".*languageContinuityBlock/);
});
