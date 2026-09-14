"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { snapshot, diff, parseNameStatus, MAX_UNTRACKED_CONTENT, MAX_UNTRACKED_TOTAL, MAX_UNTRACKED_FILES } = require("../monitor");

test("git monitor reports an unavailable non-repository without mutating it", () => {
  const state = snapshot(process.cwd());
  assert.equal(typeof state.available, "boolean");
  assert.ok(Array.isArray(state.files));
});

test("git monitor exposes working, staged, untracked and bounded changes", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-change-set-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "one\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "two\n");
  fs.writeFileSync(path.join(cwd, "staged.txt"), "staged\n"); git("add", "staged.txt");
  fs.writeFileSync(path.join(cwd, "new.txt"), "untracked\n");
  fs.writeFileSync(path.join(cwd, "large.txt"), "x".repeat(20000));
  const changes = diff(cwd);
  assert.equal(changes.available, true);
  assert.equal(changes.patchComplete, true);
  assert.ok(changes.changedFiles.includes("tracked.txt"));
  assert.ok(changes.changedFiles.includes("staged.txt"));
  assert.ok(changes.untrackedFiles.includes("new.txt"));
  assert.ok(changes.untrackedContent.some((item) => item.path === "new.txt"));
  assert.equal(changes.truncated, true);
  assert.ok(changes.untrackedContent.find((item) => item.path === "large.txt").content.includes("truncated"));
  assert.match(changes.workingTreePatch, /tracked\.txt/u);
  assert.match(changes.stagedPatch, /staged\.txt/u);
  assert.match(changes.patch, /two/u);
  assert.match(changes.patch, /staged/u);
  assert.match(changes.patch, /untracked/u);
});

test("git name-status parser keeps the new path primary for renames and copies", () => {
  const parsed = parseNameStatus("R100\0old.js\0new.js\0C075\0source.js\0copy.js\0M\0plain.js\0");
  assert.deepEqual(parsed, [
    { status: "R100", path: "new.js", newPath: "new.js", previousPath: "old.js" },
    { status: "C075", path: "copy.js", newPath: "copy.js", previousPath: "source.js" },
    { status: "M", path: "plain.js", newPath: "plain.js" }
  ]);
});

test("git ChangeSet does not leak the old porcelain rename field as a file", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-rename-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "old.txt"), "same\n"); git("add", "old.txt"); git("commit", "-qm", "initial");
  fs.renameSync(path.join(cwd, "old.txt"), path.join(cwd, "new.txt")); git("add", "-A");
  const changes = diff(cwd);
  assert.deepEqual(changes.changedFiles, ["new.txt"]);
  assert.deepEqual(changes.stagedStats[0], { added: 0, deleted: 0, file: "new.txt", binary: false, previousPath: "old.txt" });
});

test("tracked binary changes expose metadata without binary patch bytes", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-binary-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "image.bin"), Buffer.from([0, 1, 2, 3])); git("add", "image.bin"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, "image.bin"), Buffer.from([0, 1, 2, 4, 5]));
  const changes = diff(cwd);
  const binary = changes.binaryFiles.find((item) => item.path === "image.bin");
  assert.deepEqual(binary, { path: "image.bin", status: " M", size: 5, binary: true });
  assert.doesNotMatch(changes.workingTreePatch, /GIT binary patch/u);
});

test("untracked context enforces per-file, aggregate and file-count limits", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-limits-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  for (let index = 0; index < MAX_UNTRACKED_FILES + 4; index += 1) fs.writeFileSync(path.join(cwd, `new-${index}.txt`), "x".repeat(MAX_UNTRACKED_CONTENT + 100));
  const changes = diff(cwd);
  assert.equal(changes.untrackedFiles.length, MAX_UNTRACKED_FILES + 4);
  assert.ok(changes.untrackedContent.length <= MAX_UNTRACKED_FILES);
  assert.ok(changes.untrackedContent.every((item) => item.content.length <= MAX_UNTRACKED_CONTENT + 40));
  assert.ok(changes.untrackedContent.reduce((total, item) => total + item.content.length, 0) <= MAX_UNTRACKED_TOTAL + MAX_UNTRACKED_FILES * 40);
  assert.equal(changes.limits.untrackedFilesProcessed, MAX_UNTRACKED_FILES);
  assert.equal(changes.truncated, true);
});

test("sensitive untracked files are visible as metadata but never expose content", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-sensitive-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, ".env.local"), "SUPER_PRIVATE_VALUE=do-not-send\n");
  fs.writeFileSync(path.join(cwd, "new-feature.js"), "export const visible = true;\n");
  const changes = diff(cwd);
  assert.equal(changes.untrackedContent.some((item) => item.path === ".env.local"), false);
  assert.ok(changes.untrackedContent.some((item) => item.path === "new-feature.js"));
  assert.deepEqual(changes.sensitiveFiles.map((item) => item.path), [".env.local"]);
  assert.doesNotMatch(JSON.stringify(changes), /SUPER_PRIVATE_VALUE/u);
});

test("renaming a sensitive tracked file keeps both paths out of reviewer patches", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-sensitive-rename-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, ".env.local"), "RENAMED_SECRET=do-not-send\n");
  git("add", ".env.local"); git("commit", "-qm", "initial");
  fs.renameSync(path.join(cwd, ".env.local"), path.join(cwd, "config.js")); git("add", "-A");
  const changes = diff(cwd);
  assert.ok(changes.sensitiveFiles.some((item) => item.path === ".env.local"));
  assert.doesNotMatch(changes.stagedPatch, /RENAMED_SECRET/u);
  assert.doesNotMatch(JSON.stringify(changes), /RENAMED_SECRET/u);
});
