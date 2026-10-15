"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { prune, snapshot, safeDestination } = require("../scripts/managed-files");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-managed-"));
  const source = path.join(root, "package");
  const target = path.join(root, "installed");
  fs.mkdirSync(source);
  fs.mkdirSync(target);
  return { root, source, target };
}

function write(root, rel, contents) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

test("source-owned snapshot excludes user's custom files, including nested files", () => {
  const { source, target } = fixture();
  write(source, "rules.md", "managed");
  write(target, "rules.md", "managed");
  write(target, "WORKLOG.md", "personal");
  write(target, "templates/private.md", "private");
  snapshot(source, target);
  const manifest = JSON.parse(fs.readFileSync(path.join(target, "MANAGED_FILES.json"), "utf8"));
  assert.equal(manifest.version, 2);
  assert.deepEqual(Object.keys(manifest.files), ["rules.md"]);
  assert.equal(prune(source, target), 0);
  assert.equal(fs.readFileSync(path.join(target, "WORKLOG.md"), "utf8"), "personal");
});

test("a v1 manifest never triggers deletion during v2 migration", () => {
  const { source, target } = fixture();
  write(source, "rules.md", "managed");
  write(target, "rules.md", "managed");
  write(target, "WORKLOG.md", "custom");
  write(target, "MANAGED_FILES.json", JSON.stringify({
    version: 1, files: { "WORKLOG.md": { sha256: "0".repeat(64) } }
  }));
  assert.equal(prune(source, target), 0);
  assert.equal(fs.readFileSync(path.join(target, "WORKLOG.md"), "utf8"), "custom");
  snapshot(source, target);
  const manifest = JSON.parse(fs.readFileSync(path.join(target, "MANAGED_FILES.json"), "utf8"));
  assert.equal(manifest.version, 2);
  assert.equal(Object.hasOwn(manifest.files, "WORKLOG.md"), false);
});

test("v2 prunes only stale, unchanged, source-owned files", () => {
  const { source, target } = fixture();
  write(source, "legacy/old.md", "old release");
  write(target, "legacy/old.md", "old release");
  write(target, "legacy/user.md", "user file");
  snapshot(source, target);
  fs.rmSync(path.join(source, "legacy/old.md"));
  assert.equal(prune(source, target), 1);
  assert.equal(fs.existsSync(path.join(target, "legacy/old.md")), false);
  assert.equal(fs.readFileSync(path.join(target, "legacy/user.md"), "utf8"), "user file");
});

test("v2 does not delete user-modified managed content", () => {
  const { source, target } = fixture();
  write(source, "old.md", "shipped");
  write(target, "old.md", "shipped");
  snapshot(source, target);
  fs.rmSync(path.join(source, "old.md"));
  write(target, "old.md", "user edited");
  assert.equal(prune(source, target), 0);
  assert.equal(fs.readFileSync(path.join(target, "old.md"), "utf8"), "user edited");
});

test("v2 rejects traversal paths, symlinks and Windows-only separators", () => {
  const { root, target } = fixture();
  assert.equal(safeDestination(target, "../outside"), null);
  assert.equal(safeDestination(target, "nested\\outside"), null);
  assert.equal(safeDestination(target, "C:/windows"), null);
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  try {
    fs.symlinkSync(outside, path.join(target, "escape"), process.platform === "win32" ? "junction" : "dir");
    assert.equal(safeDestination(target, "escape/sensitive.md"), null);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    // Restricted Windows hosts may lack permission to create symlinks/junctions.
  }
});
