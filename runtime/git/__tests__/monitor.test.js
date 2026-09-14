"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { snapshot, diff } = require("../monitor");

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
