"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function snapshot(cwd) {
  const status = runGit(["status", "--porcelain=v1", "-z"], cwd);
  if (status === null) return { available: false, files: [] };
  const files = status.split("\0").filter(Boolean).map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
  return { available: true, files };
}

function diff(cwd) {
  const names = runGit(["diff", "HEAD", "--name-only", "--no-renames", "-z"], cwd);
  const stats = runGit(["diff", "HEAD", "--numstat"], cwd);
  const trackedPatch = runGit(["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames"], cwd);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard", "-z"], cwd);
  const untrackedPatches = [];
  let patchComplete = trackedPatch !== null && untracked !== null && !/Binary files .* differ/u.test(trackedPatch || "");
  if (untracked !== null) {
    for (const file of untracked.split("\0").filter(Boolean)) {
      const absolutePath = path.resolve(cwd, file);
      try {
        const stat = fs.lstatSync(absolutePath);
        if (!stat.isFile() || stat.size > 1024 * 1024) { patchComplete = false; continue; }
        const content = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(absolutePath));
        untrackedPatches.push(`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split("\n").length} @@\n${content.split("\n").map((line) => `+${line}`).join("\n")}`);
      } catch { patchComplete = false; }
    }
  }
  const patch = [trackedPatch, ...untrackedPatches].filter(Boolean).join("\n");
  const changedFiles = names === null ? [] : names.split("\0").filter(Boolean);
  if (untracked !== null) changedFiles.push(...untracked.split("\0").filter(Boolean));
  return {
    available: names !== null && stats !== null,
    patchComplete,
    changedFiles,
    stats: stats === null ? [] : stats.trim().split("\n").filter(Boolean).map((line) => {
      const [added, deleted, file] = line.split("\t");
      return { added: Number(added) || 0, deleted: Number(deleted) || 0, file };
    }),
    patch
  };
}

module.exports = { diff, snapshot };
