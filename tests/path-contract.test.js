"use strict";

// PORT-01: path contract — no backslashes after {{USER_HOME}} in markdown.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SCOPES = ["orquestrador", "tool-profiles", "home", "skill-library"];

function collectMd(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMd(full, out);
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

test("path contract: no backslash in {{USER_HOME}} lines (markdown)", () => {
  const files = [];
  for (const scope of SCOPES) files.push(...collectMd(path.join(ROOT, scope)));
  const skillsRoot = path.join(ROOT, "codex", "skills");
  if (fs.existsSync(skillsRoot)) {
    for (const skill of fs.readdirSync(skillsRoot)) {
      const candidate = path.join(skillsRoot, skill, "SKILL.md");
      if (fs.existsSync(candidate)) files.push(candidate);
    }
  }
  const violations = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (line.includes("{{USER_HOME}}") && line.includes("\\")) {
        violations.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(violations, [], `backslash after {{USER_HOME}} (see orquestrador/PATH_CONTRACT.md):\n${violations.join("\n")}`);
});
