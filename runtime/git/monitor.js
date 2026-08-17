"use strict";

const { spawnSync } = require("node:child_process");

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
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
  const names = runGit(["diff", "--name-status", "-z"], cwd);
  const stats = runGit(["diff", "--numstat"], cwd);
  return {
    available: names !== null && stats !== null,
    changedFiles: names === null ? [] : names.split("\0").filter(Boolean),
    stats: stats === null ? [] : stats.trim().split("\n").filter(Boolean).map((line) => {
      const [added, deleted, file] = line.split("\t");
      return { added: Number(added) || 0, deleted: Number(deleted) || 0, file };
    })
  };
}

module.exports = { diff, snapshot };
