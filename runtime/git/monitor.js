"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAX_UNTRACKED_CONTENT = 16000;
const MAX_UNTRACKED_PATCH_FILE = 1024 * 1024;
const MAX_GIT_BUFFER = 8 * 1024 * 1024;
const MAX_UNTRACKED_TOTAL = 64000;
const MAX_UNTRACKED_FILES = 50;
const TRUNCATION_MARKER = "\n...[truncated]";

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, maxBuffer: MAX_GIT_BUFFER });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function snapshot(cwd) {
  const status = runGit(["status", "--porcelain=v1", "-z"], cwd);
  if (status === null) return { available: false, files: [] };
  return { available: true, files: parseStatusPorcelain(status) };
}

function parseStatusPorcelain(output) {
  const fields = String(output || "").split("\0").filter(Boolean);
  const files = [];
  for (let index = 0; index < fields.length;) {
    const line = fields[index++];
    const status = line.slice(0, 2);
    const filePath = line.slice(3);
    if (!filePath) continue;
    const previousPath = /^[RC]/u.test(status) ? fields[index++] : undefined;
    files.push({ status, path: filePath, newPath: filePath, ...(previousPath ? { previousPath } : {}) });
  }
  return files;
}

function parseNameStatus(output) {
  const fields = String(output || "").split("\0").filter(Boolean);
  const files = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;
    const renameOrCopy = /^[RC]/u.test(status);
    const previousPath = renameOrCopy ? fields[index++] : undefined;
    const newPath = fields[index++];
    if (!newPath) continue;
    files.push({ status, path: newPath, newPath, ...(previousPath ? { previousPath } : {}) });
  }
  return files;
}

function isSensitivePath(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/").toLowerCase();
  const basename = path.posix.basename(normalized);
  return /^\.env(?:\..*)?$/u.test(basename)
    || /(?:^|[-_.])(?:credentials?|secrets?|passwords?|tokens?)(?:[-_.]|$)/u.test(basename)
    || /(?:api|access|private|service)[-_]?key/u.test(basename.replace(/\.[^.]+$/u, ""))
    || /(?:private[-_]?key|certificate|cert|service[-_]?account)$/u.test(basename.replace(/\.[^.]+$/u, ""))
    || /\.(?:pem|key|p12|pfx|jks|keystore|crt)$/u.test(basename)
    || /^id_(?:rsa|dsa|ecdsa|ed25519)$/u.test(basename);
}

function fileSize(cwd, filePath) {
  try { return fs.statSync(path.resolve(cwd, filePath)).size; } catch { return 0; }
}

function binaryMetadata(cwd, filePath, status) {
  return { path: filePath, status, size: fileSize(cwd, filePath), binary: true };
}

function sensitiveMetadata(cwd, filePath, status, binary = false) {
  return { path: filePath, status, size: fileSize(cwd, filePath), sensitive: true, ...(binary ? { binary: true } : {}) };
}

function truncateText(text, limit) {
  if (text.length <= limit) return { content: text, truncated: false };
  return { content: `${text.slice(0, Math.max(0, limit - TRUNCATION_MARKER.length))}${TRUNCATION_MARKER}`, truncated: true };
}

function untrackedContent(cwd, files) {
  const content = [];
  const binaryFiles = [];
  const sensitiveFiles = [];
  let totalChars = 0;
  let truncated = false;
  let patchComplete = true;
  const patches = [];
  const untracked = files.filter((item) => item.status === "??");
  const processed = untracked.slice(0, MAX_UNTRACKED_FILES);
  if (untracked.length > processed.length) {
    truncated = true;
    patchComplete = false;
  }
  for (const file of processed) {
    const absolutePath = path.resolve(cwd, file.path);
    try {
      const stat = fs.lstatSync(absolutePath);
      if (!stat.isFile() || stat.size > MAX_UNTRACKED_PATCH_FILE) {
        patchComplete = false;
        continue;
      }
      if (isSensitivePath(file.path)) {
        sensitiveFiles.push(sensitiveMetadata(cwd, file.path, file.status));
        patchComplete = false;
        continue;
      }
      const data = fs.readFileSync(absolutePath);
      if (data.includes(0)) {
        binaryFiles.push(binaryMetadata(cwd, file.path, file.status));
        patchComplete = false;
        continue;
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      const lines = text.split("\n");
      patches.push(`diff --git a/${file.path} b/${file.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}`);
      const remaining = MAX_UNTRACKED_TOTAL - totalChars;
      if (remaining <= 0) {
        truncated = true;
        continue;
      }
      const bounded = truncateText(text, Math.min(MAX_UNTRACKED_CONTENT, remaining));
      content.push({ path: file.path, content: bounded.content, truncated: bounded.truncated });
      totalChars += bounded.content.length;
      if (bounded.truncated) {
        truncated = true;
      }
    } catch {
      patchComplete = false;
    }
  }
  return { content, binaryFiles, sensitiveFiles, truncated, patchComplete, patches, processedFiles: processed.length };
}

function parseNumstat(output) {
  return String(output || "").trim().split("\n").filter(Boolean).map((line) => {
    const fields = line.split("\t");
    const file = fields.pop();
    const [added, deleted] = fields;
    return { added: Number(added) || 0, deleted: Number(deleted) || 0, file, binary: added === "-" || deleted === "-" };
  });
}

function normalizeStats(stats, changed, staged) {
  const entries = [...changed, ...staged];
  return stats.map((stat) => {
    const rename = entries.find((item) => item.previousPath && (stat.file === item.previousPath || stat.file === `${item.previousPath} => ${item.path}` || stat.file.includes(` => ${item.path}`)));
    return rename ? { ...stat, file: rename.path, previousPath: rename.previousPath } : stat;
  });
}

function statusFor(filePath, statusFiles, changed, staged) {
  return statusFiles.find((item) => item.path === filePath)?.status
    || changed.find((item) => item.path === filePath)?.status
    || staged.find((item) => item.path === filePath)?.status
    || "??";
}

function sanitizePatch(patch, sensitivePaths) {
  if (!patch) return "";
  const sensitive = new Set(sensitivePaths);
  return patch.split(/(?=^diff --git )/mu).filter((block) => {
    const header = block.match(/^diff --git a\/(.*?) b\/(.*?)$/mu);
    const paths = header ? [header[1], header[2]] : [];
    return !paths.some((filePath) => sensitive.has(filePath));
  }).join("");
}

function diff(cwd) {
  const names = runGit(["diff", "--name-status", "-z"], cwd);
  const stagedNames = runGit(["diff", "--cached", "--name-status", "-z"], cwd);
  const statusOutput = runGit(["status", "--porcelain=v1", "-z"], cwd);
  const statsOutput = runGit(["diff", "--numstat"], cwd);
  const stagedStatsOutput = runGit(["diff", "--cached", "--numstat"], cwd);
  const rawWorkingTreePatch = runGit(["diff", "--no-ext-diff", "--no-textconv", "--no-color"], cwd);
  const rawStagedPatch = runGit(["diff", "--cached", "--no-ext-diff", "--no-textconv", "--no-color"], cwd);
  const statusFiles = statusOutput === null ? [] : parseStatusPorcelain(statusOutput);
  const untracked = untrackedContent(cwd, statusFiles);
  const changed = names === null ? [] : parseNameStatus(names);
  const staged = stagedNames === null ? [] : parseNameStatus(stagedNames);
  const all = new Map();
  for (const item of [...changed, ...staged, ...statusFiles]) {
    const previous = all.get(item.path);
    all.set(item.path, { ...previous, ...item, ...(item.previousPath || previous?.previousPath ? { previousPath: item.previousPath || previous.previousPath } : {}), newPath: item.path });
  }
  const stats = normalizeStats(parseNumstat(statsOutput), changed, staged);
  const stagedStats = normalizeStats(parseNumstat(stagedStatsOutput), changed, staged);
  const binaryFiles = [...untracked.binaryFiles];
  const sensitiveFiles = [...untracked.sensitiveFiles];
  for (const item of [...changed, ...staged]) {
    if (item.previousPath && isSensitivePath(item.previousPath)
      && !sensitiveFiles.some((candidate) => candidate.path === item.previousPath)) {
      sensitiveFiles.push(sensitiveMetadata(cwd, item.previousPath, item.status));
    }
    if (isSensitivePath(item.path)
      && !sensitiveFiles.some((candidate) => candidate.path === item.path)) {
      sensitiveFiles.push(sensitiveMetadata(cwd, item.path, item.status));
    }
  }
  for (const stat of [...stats, ...stagedStats]) {
    if (isSensitivePath(stat.file)) {
      if (!sensitiveFiles.some((item) => item.path === stat.file)) sensitiveFiles.push(sensitiveMetadata(cwd, stat.file, statusFor(stat.file, statusFiles, changed, staged), stat.binary));
    } else if (stat.binary && !binaryFiles.some((item) => item.path === stat.file)) {
      binaryFiles.push(binaryMetadata(cwd, stat.file, statusFor(stat.file, statusFiles, changed, staged)));
    }
  }
  const sensitivePaths = sensitiveFiles.map((item) => item.path);
  const workingTreePatch = sanitizePatch(rawWorkingTreePatch || "", sensitivePaths);
  const stagedPatch = sanitizePatch(rawStagedPatch || "", sensitivePaths);
  const available = names !== null && stagedNames !== null && statusOutput !== null && statsOutput !== null && stagedStatsOutput !== null;
  const patch = [workingTreePatch, stagedPatch, ...untracked.patches].filter(Boolean).join("\n");
  const patchComplete = available
    && untracked.patchComplete
    && binaryFiles.length === 0
    && sensitiveFiles.length === 0
    && !/^GIT binary patch$/mu.test(rawWorkingTreePatch || "")
    && !/^GIT binary patch$/mu.test(rawStagedPatch || "");
  return {
    available,
    patchComplete,
    changedFiles: [...all.keys()],
    stats,
    stagedStats,
    workingTreePatch,
    stagedPatch,
    untrackedFiles: statusFiles.filter((item) => item.status === "??").map((item) => item.path),
    untrackedContent: untracked.content,
    binaryFiles,
    sensitiveFiles,
    truncated: untracked.truncated,
    limits: {
      maxUntrackedContent: MAX_UNTRACKED_CONTENT,
      maxUntrackedTotal: MAX_UNTRACKED_TOTAL,
      maxUntrackedFiles: MAX_UNTRACKED_FILES,
      untrackedFilesProcessed: untracked.processedFiles,
      untrackedFilesOmitted: Math.max(0, statusFiles.filter((item) => item.status === "??").length - untracked.processedFiles)
    },
    patch
  };
}

module.exports = { diff, snapshot, parseNameStatus, parseStatusPorcelain, MAX_UNTRACKED_CONTENT, MAX_UNTRACKED_PATCH_FILE, MAX_UNTRACKED_TOTAL, MAX_UNTRACKED_FILES, isSensitivePath };
