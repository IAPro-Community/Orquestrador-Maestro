"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_MAX = 64;

test("1.1.0: SKILL_INSTALL_POLICY is v2 with 8 roots at 64 dirs", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILL_INSTALL_POLICY.json"), "utf8"));
  assert.equal(policy.version, 2);
  const roots = Object.keys(policy.nativeRoots);
  assert.deepEqual(roots.sort(), ["agents", "antigravity", "claude", "codex", "cursor", "gemini", "opencode", "windsurf"]);
  for (const [program, entry] of Object.entries(policy.nativeRoots)) {
    assert.equal(entry.maxDirectories, EXPECTED_MAX, `${program} maxDirectories must be 64`);
    assert.ok(entry.allowDirectories.includes("orquestrador-maestro"), `${program} must allow orquestrador-maestro`);
    assert.ok(entry.allowDirectories.includes("skill-open-code-review"), `${program} must allow deprecated review alias`);
    assert.ok(entry.allowDirectories.includes("skill-open-code-delegate"), `${program} must allow deprecated delegate alias`);
  }
});

test("1.1.0: hardcoded fallbacks match policy (no 40/30 or 48 drift)", () => {
  const verifySh = fs.readFileSync(path.join(ROOT, "scripts", "verify-install.sh"), "utf8");
  const verifyPs1 = fs.readFileSync(path.join(ROOT, "scripts", "verify-install.ps1"), "utf8");
  const syncSh = fs.readFileSync(path.join(ROOT, "orquestrador", "sync-skills.sh"), "utf8");
  // NATIVE_ROOT_SPECS fallbacks must be 64 (hooks line-count "|30" is unrelated).
  assert.match(verifySh, /\|64"/);
  assert.doesNotMatch(verifySh, /NATIVE_ROOT_SPECS=\(\n(?:.*\n)*?.*\|(?:40|30)"/);
  assert.doesNotMatch(verifyPs1, /maxDirectories = 40/);
  assert.doesNotMatch(verifyPs1, /maxDirectories = 30/);
  assert.doesNotMatch(syncSh, /"\w+\|\.[\w/.-]+\|48\|/);
  assert.match(syncSh, /\|64\|/);
});

test("1.1.0: sync preserves by default, prune is explicit", () => {
  const syncSh = fs.readFileSync(path.join(ROOT, "orquestrador", "sync-skills.sh"), "utf8");
  const syncPs1 = fs.readFileSync(path.join(ROOT, "orquestrador", "sync-skills.ps1"), "utf8");
  assert.match(syncSh, /--prune/);
  assert.match(syncSh, /preserved \(use --prune to offload\)/);
  assert.match(syncPs1, /-Prune/);
  assert.match(syncPs1, /preserved \(use -Prune to offload\)/);
});

test("1.1.0: installer merges instead of wiping + records MANAGED_FILES", () => {
  const sh = fs.readFileSync(path.join(ROOT, "scripts", "install.sh"), "utf8");
  const ps1 = fs.readFileSync(path.join(ROOT, "scripts", "install.ps1"), "utf8");
  // Install path merges (uninstall path legitimately still removes on explicit uninstall).
  assert.match(sh, /merge, never wipe/i);
  assert.match(sh, /tombstone removed/);
  assert.match(sh, /MANAGED_FILES\.json/);
  assert.match(ps1, /merge, never wipe/i);
  assert.match(ps1, /tombstone removed/);
  assert.match(ps1, /MANAGED_FILES\.json/);
});
