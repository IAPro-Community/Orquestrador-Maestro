"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAX_UNTRACKED_CONTENT = 16000;
const MAX_UNTRACKED_PATCH_FILE = 1024 * 1024;
const MAX_GIT_BUFFER = 8 * 1024 * 1024;

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, maxBuffer: MAX_GIT_BUFFER });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function snapshot(cwd) {
  const status = runGit(["status", "--porcelain=v1", "-z"], cwd);
  if (status === null) return { available: false, files: [] };
  const files = status.split("\0").filter(Boolean).map((line) => ({ status: line.slice(0, 2), path: line.slice(3) }));
  return { available: true, files };
}

function untrackedContent(cwd, files) {
  const content = [];
  const binaryFiles = [];
  let truncated = false;
  let patchComplete = true;
  const patches = [];
  for (const file of files) {
    const absolutePath = path.resolve(cwd, file);
    try {
      const stat = fs.lstatSync(absolutePath);
      if (!stat.isFile() || stat.size > MAX_UNTRACKED_PATCH_FILE) {
        patchComplete = false;
        continue;
      }
      const data = fs.readFileSync(absolutePath);
      if (data.includes(0)) {
        binaryFiles.push({ path: file, binary: true, size: data.length });
        patchComplete = false;
        continue;
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      const excerptTruncated = text.length > MAX_UNTRACKED_CONTENT;
      content.push({ path: file, content: excerptTruncated ? `${text.slice(0, MAX_UNTRACKED_CONTENT)}\n...[truncated]` : text, truncated: excerptTruncated });
      truncated ||= excerptTruncated;
      const lines = text.split("\n");
      patches.push(`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}`);
    } catch {
      patchComplete = false;
    }
  }
  return { content, binaryFiles, truncated, patchComplete, patches };
}

function diff(cwd) {
  const names = runGit(["diff", "HEAD", "--name-only", "--no-renames", "-z"], cwd);
  const stats = runGit(["diff", "--numstat"], cwd);
  const stagedNames = runGit(["diff", "--cached", "--name-only", "--no-renames", "-z"], cwd);
  const stagedStats = runGit(["diff", "--cached", "--numstat"], cwd);
  const workingTreePatch = runGit(["diff", "--no-ext-diff", "--binary"], cwd);
  const stagedPatch = runGit(["diff", "--cached", "--no-ext-diff", "--binary"], cwd);
  const trackedPatch = runGit(["diff", "HEAD", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames"], cwd);
  const status = runGit(["status", "--porcelain=v1", "-z"], cwd);
  const untrackedOutput = runGit(["ls-files", "--others", "--exclude-standard", "-z"], cwd);
  const untrackedFiles = untrackedOutput === null ? [] : untrackedOutput.split("\0").filter(Boolean);
  const untracked = untrackedContent(cwd, untrackedFiles);
  const changedFiles = [...new Set([
    ...(names === null ? [] : names.split("\0").filter(Boolean)),
    ...(stagedNames === null ? [] : stagedNames.split("\0").filter(Boolean)),
    ...untrackedFiles
  ])];
  const requiredOutput = [names, stats, stagedNames, stagedStats, workingTreePatch, stagedPatch, trackedPatch, status, untrackedOutput];
  const available = requiredOutput.every((item) => item !== null);
  const patchComplete = available
    && untracked.patchComplete
    && !/^GIT binary patch$/mu.test(trackedPatch || "");
  const patch = [trackedPatch, ...untracked.patches].filter(Boolean).join("\n");
  return {
    available,
    patchComplete,
    changedFiles,
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
    untrackedFiles,
    untrackedContent: untracked.content,
    binaryFiles: untracked.binaryFiles,
    truncated: untracked.truncated,
    patch
  };
}

module.exports = { diff, snapshot };
