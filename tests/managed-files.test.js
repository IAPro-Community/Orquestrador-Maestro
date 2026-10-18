"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { prune, snapshot, safeDestination, preserveUserFiles, inspectManagedFiles } = require("../scripts/managed-files");

function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "maestro-managed-")));
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
  assert.equal(manifest.version, 3);
  assert.deepEqual(Object.keys(manifest.files), ["rules.md"]);
  assert.equal(prune(source, target), 0);
  assert.equal(fs.readFileSync(path.join(target, "WORKLOG.md"), "utf8"), "personal");
});

test("a v1 manifest never triggers deletion during v3 migration", () => {
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
  assert.equal(manifest.version, 3);
  assert.equal(Object.hasOwn(manifest.files, "WORKLOG.md"), false);
});

test("v3 prunes only stale, unchanged, source-owned files", () => {
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

test("v3 does not delete user-modified managed content", () => {
  const { source, target } = fixture();
  write(source, "old.md", "shipped");
  write(target, "old.md", "shipped");
  snapshot(source, target);
  fs.rmSync(path.join(source, "old.md"));
  write(target, "old.md", "user edited");
  assert.equal(prune(source, target), 0);
  assert.equal(fs.readFileSync(path.join(target, "old.md"), "utf8"), "user edited");
});

test("v3 rejects traversal paths, symlinks and Windows-only separators", () => {
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


test("staged upgrade preserves user files listed by unsafe v1 manifests", () => {
  const { root, source, target } = fixture();
  const staged = path.join(root, "staged");
  fs.mkdirSync(staged);
  write(source, "rules.md", "v2 rules");
  write(staged, "rules.md", "v2 rules");
  write(target, "rules.md", "v1 rules");
  write(target, "WORKLOG.md", "user work");
  write(target, "templates/user.md", "user template");
  write(target, "MANAGED_FILES.json", JSON.stringify({
    version: 1, files: {
      "rules.md": { sha256: require("node:crypto").createHash("sha256").update("v1 rules").digest("hex") },
      "WORKLOG.md": { sha256: "0".repeat(64) },
      "templates/user.md": { sha256: "0".repeat(64) }
    }
  }));
  const result = preserveUserFiles(target, staged);
  assert.equal(result.preserved, 2);
  assert.equal(result.retired, 0);
  assert.equal(fs.readFileSync(path.join(staged, "WORKLOG.md"), "utf8"), "user work");
  assert.equal(fs.readFileSync(path.join(staged, "templates/user.md"), "utf8"), "user template");
  assert.equal(fs.readFileSync(path.join(staged, "rules.md"), "utf8"), "v2 rules");
  assert.equal(fs.readFileSync(path.join(target, "WORKLOG.md"), "utf8"), "user work");
});

test("staged update keeps a customized managed file active and reports the upstream copy", () => {
  const { root, source, target } = fixture();
  const staged = path.join(root, "staged");
  const artifacts = path.join(root, "backup", "update-artifacts");
  fs.mkdirSync(staged);
  write(source, "rules.md", "old upstream rules");
  write(target, "rules.md", "old upstream rules");
  snapshot(source, target);
  write(target, "rules.md", "user customized rules");
  write(source, "rules.md", "new upstream rules");
  write(staged, "rules.md", "new upstream rules");

  const report = preserveUserFiles(target, staged, artifacts);
  assert.equal(fs.readFileSync(path.join(staged, "rules.md"), "utf8"), "user customized rules");
  assert.equal(fs.readFileSync(path.join(artifacts, "upstream-overrides", "rules.md"), "utf8"), "new upstream rules");
  assert.deepEqual(report.preservedManagedOverrides, [{ path: "rules.md", upstreamCopy: "upstream-overrides/rules.md" }]);
  snapshot(source, staged);
  assert.deepEqual(inspectManagedFiles(staged).customizations, ["rules.md"]);
  assert.deepEqual(inspectManagedFiles(staged).modified, []);
});

test("staged update preserves empty custom directories", () => {
  const { root, source, target } = fixture();
  const staged = path.join(root, "staged");
  fs.mkdirSync(staged);
  write(source, "rules.md", "upstream");
  write(target, "rules.md", "upstream");
  fs.mkdirSync(path.join(target, "user-empty", "nested"), { recursive: true });
  const report = preserveUserFiles(target, staged);
  assert.ok(fs.existsSync(path.join(staged, "user-empty", "nested")));
  assert.ok(report.preservedDirectories.includes("user-empty"));
  assert.ok(report.preservedDirectories.includes("user-empty/nested"));
});

test("staging omits only unchanged v2 managed files removed from the package", () => {
  const { root, source, target } = fixture();
  const staged = path.join(root, "staged");
  fs.mkdirSync(staged);
  write(source, "legacy/shipped.md", "shipped");
  write(target, "legacy/shipped.md", "shipped");
  write(source, "legacy/edited.md", "shipped");
  write(target, "legacy/edited.md", "shipped");
  snapshot(source, target);
  write(target, "legacy/edited.md", "user edited");
  write(target, "WORKLOG.md", "my notes");

  const result = preserveUserFiles(target, staged);
  assert.equal(result.retired, 1);
  assert.equal(result.preserved, 2);
  assert.equal(fs.existsSync(path.join(staged, "legacy/shipped.md")), false);
  assert.equal(fs.readFileSync(path.join(staged, "legacy/edited.md"), "utf8"), "user edited");
  assert.equal(fs.readFileSync(path.join(staged, "WORKLOG.md"), "utf8"), "my notes");
  // Failed validations / abandoned staged install cannot damage the live tree.
  assert.equal(fs.readFileSync(path.join(target, "legacy/shipped.md"), "utf8"), "shipped");
});
