"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { configurationState, inspectClaude, printClaudeGuidance, npmPermissionHint } = require("../orquestrador/lib/install-diagnostics");

test("permission diagnostics do not suggest sudo or include registry output", () => {
  for (const code of ["EACCES", "EPERM"]) {
    const hint = npmPermissionHint({ status: 1, stderr: "npm error " + code + " private-registry-value" });
    assert.match(hint, /prefixo global npm/);
    assert.doesNotMatch(hint, /private-registry-value/);
  }
  assert.equal(npmPermissionHint({ status: 1, stderr: "ETIMEDOUT" }), null);
});

test("Claude profile checks report incompatible preserved skill and unresolved home without modifying files", t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-doctor-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  assert.equal(configurationState("claude", home), "absent");
  const directory = path.join(home, ".claude", "skills", "orquestrador-maestro");
  fs.mkdirSync(directory, { recursive: true });
  const skill = path.join(directory, "SKILL.md");
  const old = "Codex is the " + "orquestrador. Read {{USER_HOME}}/.orquestrador/rules.md.";
  fs.writeFileSync(skill, old);
  assert.equal(configurationState("claude", home), "present");
  const findings = inspectClaude(home);
  assert.ok(findings.some(item => item.code === "CLAUDE_FOREIGN_SKILL"));
  assert.ok(findings.some(item => item.code === "STALE_HOME_REFERENCE"));
  const output = [];
  printClaudeGuidance(home, value => output.push(value));
  assert.match(output.join("\n"), /sessão nova/);
  assert.equal(fs.readFileSync(skill, "utf8"), old);
  fs.writeFileSync(skill, "The active assistant is the orquestrador. Read ~/.orquestrador/rules.md.");
  assert.deepEqual(inspectClaude(home), []);
  fs.writeFileSync(path.join(home, ".claude", ".maestro-managed"), "managed by orquestrador-maestro\ntool: claude\n");
  assert.equal(configurationState("claude", home), "maestro-managed");
});
