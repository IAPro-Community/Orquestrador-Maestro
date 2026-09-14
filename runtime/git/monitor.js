"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

const MAX_UNTRACKED_CONTENT = 16000;

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

function parseNameStatus(output) {
  const fields = output.split("\0").filter(Boolean);
  const files = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (!path) continue;
    files.push({ status, path });
  }
  return files;
}

function untrackedContent(cwd, files) {
  const content = [];
  const binaryFiles = [];
  let truncated = false;
  for (const file of files.filter((item) => item.status === "??")) {
    const fullPath = require("node:path").join(cwd, file.path);
    let data;
    try { data = fs.readFileSync(fullPath); } catch { continue; }
    if (data.includes(0)) { binaryFiles.push({ path: file.path, binary: true, size: data.length }); continue; }
    const text = data.toString("utf8");
    if (text.length > MAX_UNTRACKED_CONTENT) { content.push({ path: file.path, content: `${text.slice(0, MAX_UNTRACKED_CONTENT)}\n...[truncated]`, truncated: true }); truncated = true; }
    else content.push({ path: file.path, content: text, truncated: false });
  }
  return { content, binaryFiles, truncated };
}

function diff(cwd) {
  const names = runGit(["diff", "--name-status", "-z"], cwd);
  const stagedNames = runGit(["diff", "--cached", "--name-status", "-z"], cwd);
  const statusOutput = runGit(["status", "--porcelain=v1", "-z"], cwd);
  const stats = runGit(["diff", "--numstat"], cwd);
  const stagedStats = runGit(["diff", "--cached", "--numstat"], cwd);
  const workingTreePatch = runGit(["diff", "--no-ext-diff", "--binary"], cwd);
  const stagedPatch = runGit(["diff", "--cached", "--no-ext-diff", "--binary"], cwd);
  const statusFiles = statusOutput === null ? [] : statusOutput.split("\0").filter(Boolean).map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
  const untracked = untrackedContent(cwd, statusFiles);
  const changed = names === null ? [] : parseNameStatus(names);
  const staged = stagedNames === null ? [] : parseNameStatus(stagedNames);
  const allFiles = [...new Map([...changed, ...staged, ...statusFiles].map((item) => [item.path, item])).values()];
  return {
    available: names !== null && stagedNames !== null && statusOutput !== null && stats !== null && stagedStats !== null,
    changedFiles: allFiles.map((item) => item.path),
    stats: stats === null ? [] : stats.trim().split("\n").filter(Boolean).map((line) => {
      const [added, deleted, file] = line.split("\t");
      return { added: Number(added) || 0, deleted: Number(deleted) || 0, file };
    }),
    stagedStats: stagedStats === null ? [] : stagedStats.trim().split("\n").filter(Boolean).map((line) => {
      const [added, deleted, file] = line.split("\t");
      return { added: Number(added) || 0, deleted: Number(deleted) || 0, file };
    }),
    workingTreePatch: workingTreePatch || "",
    stagedPatch: stagedPatch || "",
    untrackedFiles: statusFiles.filter((item) => item.status === "??").map((item) => item.path),
    untrackedContent: untracked.content,
    binaryFiles: untracked.binaryFiles,
    truncated: untracked.truncated
  };
}

module.exports = { diff, snapshot };
