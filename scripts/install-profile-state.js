"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Symbolic IDs keep installation metadata portable and free of home paths.
const PROFILE_ROOTS = Object.freeze({
  codex: ".codex",
  opencode: ".opencode",
  "opencode-global": ".config/opencode",
  claude: ".claude",
  cursor: ".cursor",
  gemini: ".gemini",
  windsurf: ".windsurf",
  "windsurf-global": ".codeium/windsurf/memories",
  antigravity: ".antigravity",
  "ai-standards": ".ai-standards",
  mimo: ".mimo",
  kimi: ".kimi-code",
  grok: ".grok",
  "antigravity-home": "antigravity-rules.json"
});
const STATE_FILE = "INSTALL_PROFILES.json";

function validateState(state) {
  if (state?.version !== 1 || !Array.isArray(state.profiles) ||
      state.profiles.some(id => typeof id !== "string" || !Object.hasOwn(PROFILE_ROOTS, id)) ||
      new Set(state.profiles).size !== state.profiles.length) {
    throw new Error("Invalid install profile metadata");
  }
  return state;
}

function writeState(root, profiles) {
  const state = validateState({ version: 1, profiles });
  fs.writeFileSync(path.join(root, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function readRoots(root) {
  const state = validateState(JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), "utf8")));
  return state.profiles.map(id => PROFILE_ROOTS[id]);
}

if (require.main === module) {
  try {
    const [command, root, ...profiles] = process.argv.slice(2);
    if (command === "write") writeState(root, profiles);
    else if (command === "roots") process.stdout.write(readRoots(root).join("\n"));
    else throw new Error("Expected write or roots command");
  } catch (error) {
    console.error(`Install profiles: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { PROFILE_ROOTS, STATE_FILE, validateState, writeState, readRoots };
