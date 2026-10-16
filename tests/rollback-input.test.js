"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

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
  fs.mkdirSync(path.join(backupRoot, "arbitrary-folder"));
  const run = spawnSync(process.execPath, [cli, "rollback", "--home-path", home, "--list"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /20261015-091234-12345/);
  assert.doesNotMatch(run.stdout, /arbitrary-folder/);
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
