"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const managedFiles = require("../scripts/managed-files");
const nativeSkillsSync = require("../orquestrador/bin/sync-managed-skill");

const cli = path.join(__dirname, "..", "bin", "orquestrador-maestro.js");

test("rollback --to never accepts path traversal or arbitrary directory names", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-"));
  fs.mkdirSync(path.join(home, ".orquestrador-public-backups"));
  for (const invalid of ["../outside", "/tmp/outside", "..\\outside", "not-a-backup"]) {
    const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", invalid], { encoding: "utf8" });
    assert.notEqual(run.status, 0, "rollback must reject: " + invalid);
    assert.match(run.stderr, /Identificador de backup invalido/);
  }
});

test("rollback --list exposes only legitimate installer backup directories", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-list-"));
  const backupRoot = path.join(home, ".orquestrador-public-backups");
  fs.mkdirSync(path.join(backupRoot, "20261015-091234-12345"), { recursive: true });
  fs.mkdirSync(path.join(backupRoot, `20261015-091234-54321-${"a".repeat(32)}`), { recursive: true });
  fs.mkdirSync(path.join(backupRoot, "arbitrary-folder"));
  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--list"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /20261015-091234-12345/);
  assert.match(run.stdout, /20261015-091234-54321-[a-f0-9]{32}/i);
  assert.doesNotMatch(run.stdout, /arbitrary-folder/);
});

test("rollback accepts real installer suffixes and replaces the core from the reusable snapshot", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-restore-"));
  const backupRoot = path.join(home, ".orquestrador-public-backups");
  const stamp = `20261016-091234-12345-${"a".repeat(32)}`;
  const backupCore = path.join(backupRoot, stamp, ".orquestrador");
  const activeCore = path.join(home, ".orquestrador");
  const oldSource = path.join(home, "old-package");
  const currentSource = path.join(home, "current-package");
  for (const root of [backupCore, activeCore, oldSource, currentSource]) fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(oldSource, "rules.md"), "snapshot rules\n");
  fs.writeFileSync(path.join(oldSource, "removed-in-snapshot.md"), "snapshot only\n");
  fs.writeFileSync(path.join(currentSource, "rules.md"), "current rules\n");
  fs.writeFileSync(path.join(currentSource, "current-only.md"), "must be removed by full restore\n");
  fs.cpSync(oldSource, backupCore, { recursive: true });
  fs.cpSync(currentSource, activeCore, { recursive: true });
  managedFiles.snapshot(oldSource, backupCore);
  managedFiles.snapshot(currentSource, activeCore);

  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", stamp], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(path.join(activeCore, "rules.md"), "utf8"), "snapshot rules\n");
  assert.equal(fs.readFileSync(path.join(activeCore, "removed-in-snapshot.md"), "utf8"), "snapshot only\n");
  assert.equal(fs.existsSync(path.join(activeCore, "current-only.md")), false);
  assert.equal(fs.existsSync(backupCore), true, "rollback must retain its source snapshot");
});

test("rollback restores the legacy core name and removes a newer canonical-only tree", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-legacy-"));
  const backupRoot = path.join(home, ".orquestrador-public-backups");
  const stamp = "20261016-091234-12345";
  const backupCore = path.join(backupRoot, stamp, ".orquestrador-maestro");
  fs.mkdirSync(backupCore, { recursive: true });
  fs.writeFileSync(path.join(backupCore, "legacy.md"), "legacy snapshot\n");
  fs.mkdirSync(path.join(home, ".orquestrador"), { recursive: true });
  fs.writeFileSync(path.join(home, ".orquestrador", "newer.md"), "current canonical tree\n");

  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", stamp], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(path.join(home, ".orquestrador-maestro", "legacy.md"), "utf8"), "legacy snapshot\n");
  assert.equal(fs.existsSync(path.join(home, ".orquestrador")), false);
});

test("rollback preserves current core customizations and merges current config over the snapshot", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-preserve-"));
  const backupRoot = path.join(home, ".orquestrador-public-backups");
  const stamp = "20261016-101010-34567";
  const backupCore = path.join(backupRoot, stamp, ".orquestrador");
  const activeCore = path.join(home, ".orquestrador");
  const oldSource = path.join(home, "old-package");
  const currentSource = path.join(home, "current-package");
  for (const root of [backupCore, activeCore, oldSource, currentSource]) fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(oldSource, "rules.md"), "snapshot official rules\n");
  fs.writeFileSync(path.join(oldSource, "config.json"), JSON.stringify({ schemaVersion: 1, snapshotKey: true, preference: "old" }, null, 2));
  fs.writeFileSync(path.join(currentSource, "rules.md"), "updated official rules\n");
  fs.writeFileSync(path.join(currentSource, "config.json"), JSON.stringify({ schemaVersion: 1, currentKey: true, preference: "new" }, null, 2));
  fs.cpSync(oldSource, backupCore, { recursive: true });
  fs.cpSync(currentSource, activeCore, { recursive: true });
  managedFiles.snapshot(oldSource, backupCore);
  managedFiles.snapshot(currentSource, activeCore);
  fs.writeFileSync(path.join(activeCore, "rules.md"), "user customized rules\n");
  fs.writeFileSync(path.join(activeCore, "private-notes.md"), "keep this file\n");

  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", stamp], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(path.join(activeCore, "rules.md"), "utf8"), "user customized rules\n");
  assert.equal(fs.readFileSync(path.join(activeCore, "private-notes.md"), "utf8"), "keep this file\n");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(activeCore, "config.json"), "utf8")), {
    schemaVersion: 1,
    snapshotKey: true,
    currentKey: true,
    preference: "new",
  });
  assert.deepEqual(managedFiles.inspectManagedFiles(activeCore).customizations, ["config.json", "rules.md"]);
});

test("rollback restores updated native skill trees and the pre-update native state", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-native-"));
  const backupRoot = path.join(home, ".orquestrador-public-backups");
  const stamp = "20261016-111111-45678";
  const backupDirectory = path.join(backupRoot, stamp);
  const backupCore = path.join(backupDirectory, ".orquestrador");
  const activeCore = path.join(home, ".orquestrador");
  const nativeRoot = path.join(home, ".agents", "skills");
  const activeSkill = path.join(nativeRoot, "skill-example");
  const nativeArtifacts = path.join(backupDirectory, "update-artifacts", "native-skills");
  const previousSkill = path.join(nativeArtifacts, "native-skills-before", "agents", "skill-example");
  for (const root of [backupCore, activeCore, activeSkill, previousSkill]) fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(backupCore, "version.txt"), "before update\n");
  fs.writeFileSync(path.join(activeCore, "version.txt"), "after update\n");
  fs.writeFileSync(path.join(previousSkill, "SKILL.md"), "native version before\n");
  fs.writeFileSync(path.join(activeSkill, "SKILL.md"), "native version after\n");
  const previousHash = nativeSkillsSync.treeHash(previousSkill);
  const installedHash = nativeSkillsSync.treeHash(activeSkill);
  const statePath = path.join(nativeRoot, nativeSkillsSync.STATE_FILE);
  const stateBefore = {
    version: nativeSkillsSync.STATE_VERSION,
    skills: {
      "skill-example": { sourceTreeSha256: previousHash, installedTreeSha256: previousHash, customized: false },
      "unrelated-skill": { sourceTreeSha256: "a".repeat(64), installedTreeSha256: "a".repeat(64), customized: false },
    },
  };
  fs.writeFileSync(statePath, JSON.stringify({
    version: nativeSkillsSync.STATE_VERSION,
    skills: {
      "skill-example": { sourceTreeSha256: installedHash, installedTreeSha256: installedHash, customized: false },
      "unrelated-skill": stateBefore.skills["unrelated-skill"],
    },
  }));
  const stateSnapshot = path.join(nativeArtifacts, "native-skill-state-before", "agents.json");
  fs.mkdirSync(path.dirname(stateSnapshot), { recursive: true });
  fs.writeFileSync(stateSnapshot, JSON.stringify(stateBefore));
  fs.writeFileSync(path.join(nativeArtifacts, "native-skills-report.json"), JSON.stringify({
    schemaVersion: 1,
    kind: "orquestrador-native-skill-update-report",
    operations: [{
      program: "agents",
      skill: "skill-example",
      targetRoot: ".agents/skills",
      action: "updated",
      sourceTreeSha256: installedHash,
      installedTreeSha256: installedHash,
      previousTreeSha256: previousHash,
      previousCopy: "native-skills-before/agents/skill-example",
    }],
  }, null, 2));

  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", stamp], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(path.join(activeSkill, "SKILL.md"), "utf8"), "native version before\n");
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, "utf8")), stateBefore);
  assert.equal(fs.readFileSync(path.join(activeCore, "version.txt"), "utf8"), "after update\n", "current user-owned core files survive rollback");
  assert.equal(fs.existsSync(previousSkill), true, "the rollback source remains reusable");

  const repeated = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", stamp], { encoding: "utf8" });
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(fs.readFileSync(path.join(activeSkill, "SKILL.md"), "utf8"), "native version before\n");
});


test("rollback refuses a valid-looking timestamp that is not an approved backup directory", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-unsafe-"));
  const backupRoot = path.join(home, ".orquestrador-public-backups");
  const outside = path.join(home, "untrusted");
  fs.mkdirSync(backupRoot);
  fs.mkdirSync(outside);
  const stamp = "20261016-091234-12345";
  let linked = false;
  try {
    fs.symlinkSync(outside, path.join(backupRoot, stamp), process.platform === "win32" ? "junction" : "dir");
    linked = true;
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
  if (!linked) return; // Windows installations without junction privileges.
  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", stamp], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Backup inexistente ou inválido|Nenhum backup válido/);
});

test("rollback rejects explicit valid-looking backups that have been removed", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-rollback-missing-"));
  fs.mkdirSync(path.join(home, ".orquestrador-public-backups", "20261016-000000-1"), { recursive: true });
  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--to", "20261016-000000-2"], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Backup inexistente ou inválido/);
});
