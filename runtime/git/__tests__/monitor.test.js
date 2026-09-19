"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { snapshot, diff, parseNameStatus, isSensitivePath, MAX_UNTRACKED_CONTENT, MAX_UNTRACKED_PATCH_FILE, MAX_UNTRACKED_TOTAL, MAX_UNTRACKED_FILES, MAX_UNTRACKED_PATCH_TOTAL } = require("../monitor");

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
  // Bounded ChangeSet contract: any truncated content marks the patch incomplete.
  assert.equal(changes.patchComplete, false);
  assert.ok(changes.changedFiles.includes("tracked.txt"));
  assert.ok(changes.changedFiles.includes("staged.txt"));
  assert.ok(changes.untrackedFiles.includes("new.txt"));
  assert.ok(changes.untrackedContent.some((item) => item.path === "new.txt"));
  assert.equal(changes.truncated, true);
  assert.ok(changes.untrackedContent.find((item) => item.path === "large.txt").content.includes("truncated"));
  const largeOmission = changes.omitted.find((item) => item.path === "large.txt");
  assert.deepEqual(Object.keys(largeOmission).sort(), ["path", "reason", "size", "status"]);
  assert.equal(largeOmission.reason, "per-file-content-truncated");
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
  assert.equal(changes.patchComplete, false);
  const countOmissions = changes.omitted.filter((item) => item.reason === "file-count-limit");
  assert.equal(countOmissions.length, 4);
  assert.ok(countOmissions.every((item) => typeof item.path === "string" && item.status === "??" && typeof item.size === "number"));
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

test("sensitive files in subdirectories expose metadata but never content", () => {
  assert.equal(isSensitivePath("secrets/app.js"), true);
  assert.equal(isSensitivePath("config/credentials.json"), true);
  assert.equal(isSensitivePath("deploy/private/keys.txt"), true);
  assert.equal(isSensitivePath("infra/certs/tls.txt"), true);
  assert.equal(isSensitivePath("src/app.js"), false);
  assert.equal(isSensitivePath("src/tokenize.js"), false);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-sensitive-dir-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  fs.mkdirSync(path.join(cwd, "secrets"));
  fs.writeFileSync(path.join(cwd, "secrets", "config.js"), "SUBDIR_SECRET=do-not-send\n");
  fs.writeFileSync(path.join(cwd, "visible.js"), "export const visible = true;\n");
  const changes = diff(cwd);
  assert.equal(changes.untrackedContent.some((item) => item.path === "secrets/config.js"), false);
  // With --untracked-files=all git enumerates inner files individually; the
  // sensitive file itself must be flagged as metadata only (no collapsed dir/).
  assert.ok(changes.sensitiveFiles.some((item) => item.path === "secrets/config.js"));
  const dirOmission = changes.omitted.find((item) => item.path === "secrets/config.js");
  assert.equal(dirOmission.reason, "sensitive");
  assert.equal(dirOmission.status, "??");
  assert.ok(changes.untrackedContent.some((item) => item.path === "visible.js"));
  assert.equal(changes.patchComplete, false);
  assert.doesNotMatch(JSON.stringify(changes), /SUBDIR_SECRET/u);
});

test("sensitive untracked files inside tracked directories are flagged per segment", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-sensitive-nested-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.mkdirSync(path.join(cwd, "config"));
  fs.writeFileSync(path.join(cwd, "config", "tracked.txt"), "initial\n");
  git("add", "config/tracked.txt"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, "config", "credentials.json"), "{\"NESTED_SECRET\": \"do-not-send\"}\n");
  const changes = diff(cwd);
  assert.equal(changes.untrackedContent.some((item) => item.path === "config/credentials.json"), false);
  assert.ok(changes.sensitiveFiles.some((item) => item.path === "config/credentials.json"));
  const omission = changes.omitted.find((item) => item.path === "config/credentials.json");
  assert.equal(omission.reason, "sensitive");
  assert.equal(changes.patchComplete, false);
  assert.doesNotMatch(JSON.stringify(changes), /NESTED_SECRET/u);
});

test("untracked files above the per-file size limit are omitted with metadata", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-too-large-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, "huge.bin.txt"), "x".repeat(MAX_UNTRACKED_PATCH_FILE + 1024));
  fs.writeFileSync(path.join(cwd, "small.txt"), "visible\n");
  const changes = diff(cwd);
  assert.equal(changes.untrackedContent.some((item) => item.path === "huge.bin.txt"), false);
  const omission = changes.omitted.find((item) => item.path === "huge.bin.txt");
  assert.equal(omission.reason, "file-too-large");
  assert.ok(omission.size > MAX_UNTRACKED_PATCH_FILE);
  assert.ok(changes.untrackedContent.some((item) => item.path === "small.txt"));
  assert.equal(changes.patchComplete, false);
});

test("aggregate content limit omits later files with explicit reasons", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-aggregate-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  const perFile = Math.floor(MAX_UNTRACKED_CONTENT / 2);
  for (let index = 0; index < 9; index += 1) fs.writeFileSync(path.join(cwd, `chunk-${index}.txt`), "y".repeat(perFile));
  const changes = diff(cwd);
  assert.equal(changes.truncated, true);
  assert.equal(changes.patchComplete, false);
  const reasons = changes.omitted.map((item) => item.reason);
  assert.ok(reasons.includes("aggregate-content-limit"));
  assert.ok(changes.omitted.every((item) => typeof item.path === "string" && typeof item.status === "string" && typeof item.size === "number" && typeof item.reason === "string"));
});

test("aggregate synthetic patch limit keeps the reviewer patch bounded", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-patch-total-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  for (let index = 0; index < MAX_UNTRACKED_FILES; index += 1) fs.writeFileSync(path.join(cwd, `bulk-${index}.txt`), "z".repeat(6000));
  const changes = diff(cwd);
  assert.ok(changes.limits.untrackedPatchChars <= MAX_UNTRACKED_PATCH_TOTAL);
  assert.ok(changes.omitted.some((item) => item.reason === "aggregate-patch-limit"));
  assert.equal(changes.patchComplete, false);
  assert.equal(changes.limits.maxUntrackedPatchTotal, MAX_UNTRACKED_PATCH_TOTAL);
});

test("wholly untracked directories enumerate inner files individually", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-untracked-dir-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  fs.mkdirSync(path.join(cwd, "newdir", "sub"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "newdir", "file1.txt"), "hello\n");
  fs.writeFileSync(path.join(cwd, "newdir", "sub", "file2.txt"), "world\n");
  const changes = diff(cwd);
  assert.ok(changes.untrackedFiles.includes("newdir/file1.txt"));
  assert.ok(changes.untrackedFiles.includes("newdir/sub/file2.txt"));
  assert.ok(changes.untrackedContent.some((item) => item.path === "newdir/file1.txt"));
  assert.ok(changes.untrackedContent.some((item) => item.path === "newdir/sub/file2.txt"));
  assert.match(changes.patch, /newdir\/file1\.txt/u);
  assert.match(changes.patch, /newdir\/sub\/file2\.txt/u);
  assert.equal(changes.patchComplete, true);
});

test(".env.example handling respects parent sensitive segments", () => {
  assert.equal(isSensitivePath(".env.example"), false);
  assert.equal(isSensitivePath("config/.env.example"), false);
  assert.equal(isSensitivePath("secrets/.env.example"), true);
  assert.equal(isSensitivePath("credentials/.env.example"), true);
  assert.equal(isSensitivePath("private/.env.example"), true);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-envexample-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, ".env.example"), "PLACEHOLDER=example\n");
  fs.mkdirSync(path.join(cwd, "secrets"));
  fs.writeFileSync(path.join(cwd, "secrets", ".env.example"), "REAL_SECRET=do-not-send\n");
  const changes = diff(cwd);
  assert.ok(changes.untrackedContent.some((item) => item.path === ".env.example"));
  assert.equal(changes.untrackedContent.some((item) => item.path === "secrets/.env.example"), false);
  assert.ok(changes.sensitiveFiles.some((item) => item.path === "secrets/.env.example"));
  assert.doesNotMatch(JSON.stringify(changes), /REAL_SECRET/u);
});

test("untracked binary files expose metadata without content", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-untracked-binary-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n"); git("add", "tracked.txt"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, "blob.bin"), Buffer.from([0, 1, 2, 3, 4]));
  const changes = diff(cwd);
  assert.ok(changes.binaryFiles.some((item) => item.path === "blob.bin"));
  const omission = changes.omitted.find((item) => item.path === "blob.bin");
  assert.equal(omission.reason, "binary");
  assert.equal(changes.patchComplete, false);
});

test("deleted tracked files appear in the ChangeSet", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-deleted-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, "gone.txt"), "bye\n"); git("add", "gone.txt"); git("commit", "-qm", "initial");
  fs.rmSync(path.join(cwd, "gone.txt"));
  const changes = diff(cwd);
  assert.ok(changes.changedFiles.includes("gone.txt"));
  assert.equal(changes.patchComplete, true);
});

test("sensitive staged and working-tree patches never leak bytes", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-sensitive-patches-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
  git("init", "-q"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "test");
  fs.writeFileSync(path.join(cwd, ".env"), "STAGED_SECRET=do-not-send\n"); git("add", ".env"); git("commit", "-qm", "initial");
  fs.writeFileSync(path.join(cwd, ".env"), "STAGED_SECRET=changed-do-not-send\n");
  fs.writeFileSync(path.join(cwd, "notes.txt"), "visible\n");
  const changes = diff(cwd);
  assert.ok(changes.sensitiveFiles.some((item) => item.path === ".env"));
  assert.doesNotMatch(changes.workingTreePatch || "", /STAGED_SECRET/u);
  assert.doesNotMatch(changes.patch || "", /STAGED_SECRET/u);
  assert.equal(changes.patchComplete, false);
});
