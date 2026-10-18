"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runSkillSync } = require("./test-helpers.js");

const ROOT = path.resolve(__dirname, "..");

test("targets sync uses the bundled core when .orquestrador only contains target state", () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "maestro-target-sync-fallback-")));
  try {
    const partialCore = path.join(home, ".orquestrador");
    fs.mkdirSync(partialCore, { recursive: true });
    fs.writeFileSync(path.join(partialCore, "INSTALL_STATE.json"), "{}\n", "utf8");

    const shellSync = path.join(ROOT, "orquestrador", "sync-skills.sh");
    const result = runSkillSync(shellSync, home, { only: "codex" });
    assert.equal(result.status, 0, `native sync failed:\n${result.stderr}\n${result.stdout}`);
    assert.ok(fs.existsSync(path.join(home, ".codex", "skills", "orquestrador-maestro", "SKILL.md")));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
