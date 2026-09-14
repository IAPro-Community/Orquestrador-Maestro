"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { diff, snapshot } = require("../monitor");

test("git monitor reports an unavailable non-repository without mutating it", () => {
  const state = snapshot(process.cwd());
  assert.equal(typeof state.available, "boolean");
  assert.ok(Array.isArray(state.files));
});

test("git monitor includes staged, unstaged, and untracked patch content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-git-monitor-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "--quiet");
  git("config", "user.name", "Monitor Test");
  git("config", "user.email", "monitor@example.invalid");
  fs.writeFileSync(path.join(root, "tracked.js"), "const value = 1;\n", "utf8");
  git("add", "tracked.js");
  git("commit", "--quiet", "-m", "initial");
  fs.writeFileSync(path.join(root, "tracked.js"), "const value = 2;\n", "utf8");
  git("add", "tracked.js");
  fs.writeFileSync(path.join(root, "tracked.js"), "const value = 3;\n", "utf8");
  fs.writeFileSync(path.join(root, "new.js"), "const added = true;\n", "utf8");
  const result = diff(root);
  assert.equal(result.available, true);
  assert.equal(result.patchComplete, true);
  assert.match(result.patch, /const value = 3;/u);
  assert.match(result.patch, /const value = 1;/u);
  assert.match(result.patch, /const added = true;/u);
  assert.ok(result.changedFiles.includes("new.js"));
});
