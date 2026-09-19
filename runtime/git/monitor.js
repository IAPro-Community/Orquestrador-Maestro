"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAX_UNTRACKED_CONTENT = 16000;
const MAX_UNTRACKED_PATCH_FILE = 1024 * 1024;
const MAX_GIT_BUFFER = 8 * 1024 * 1024;
const MAX_UNTRACKED_TOTAL = 64000;
const MAX_UNTRACKED_FILES = 50;
// Aggregate cap for synthetic untracked patches materialized for the reviewer.
// Real git patches are already bounded by MAX_GIT_BUFFER; this keeps the
// reviewer-bound ChangeSet bounded even with many untracked files.
const MAX_UNTRACKED_PATCH_TOTAL = 256 * 1024;
const TRUNCATION_MARKER = "\n...[truncated]";

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, maxBuffer: MAX_GIT_BUFFER });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

function snapshot(cwd) {
  const status = runGit(["status", "--porcelain=v1", "--untracked-files=all", "-z"], cwd);
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
  const segments = normalized.split("/").filter(Boolean);
  const basename = path.posix.basename(normalized);
  const stem = basename.replace(/\.[^.]+$/u, "");
  // Parent segments win over the `.env.example` template exception: a template
  // inside a sensitive directory (secrets/, credentials/, private/) is still
  // sensitive and must never reach the reviewer.
  const parentSegments = segments.slice(0, -1);
  const parentSensitive = parentSegments.some((segment) => /^\.env(?:\..*)?$/u.test(segment)
    || /(?:^|[-_.])(?:credentials?|secrets?|passwords?|tokens?)(?:[-_.]|$)/u.test(segment)
    || /^(?:private|certs?|certificates?)$/u.test(segment));
  if (parentSensitive) return true;
  // `.env.example` is a checked-in placeholder template, not a secret: it must
  // stay reviewable instead of fail-closing every ChangeSet that touches it.
  // Only the root-level or non-sensitive-directory template is allowed.
  if (basename === ".env.example") return false;
  if (/^\.env(?:\..*)?$/u.test(basename)) return true;
  if (/(?:^|[-_.])(?:credentials?|secrets?|passwords?|tokens?)(?:[-_.]|$)/u.test(basename)) return true;
  if (/(?:api|access|private|service)[-_]?key/u.test(stem)) return true;
  if (/(?:private[-_]?key|certificate|cert|service[-_]?account)$/u.test(stem)) return true;
  if (/\.(?:pem|key|p12|pfx|jks|keystore|crt)$/u.test(basename)) return true;
  if (/^id_(?:rsa|dsa|ecdsa|ed25519)$/u.test(basename)) return true;
  // Every path segment counts: a sensitive directory taints everything under it.
  return segments.some((segment) => /^\.env(?:\..*)?$/u.test(segment)
    || /(?:^|[-_.])(?:credentials?|secrets?|passwords?|tokens?)(?:[-_.]|$)/u.test(segment)
    || /^(?:private|certs?|certificates?)$/u.test(segment));
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
  // Every file whose bytes are not fully visible to the reviewer is recorded
  // here with path, status, size and reason. patchComplete is false whenever
  // this list is non-empty.
  const omitted = [];
  let totalChars = 0;
  let patchChars = 0;
  let truncated = false;
  let patchComplete = true;
  const patches = [];
  const untracked = files.filter((item) => item.status === "??");
  const processed = untracked.slice(0, MAX_UNTRACKED_FILES);
  for (const skipped of untracked.slice(processed.length)) {
    truncated = true;
    patchComplete = false;
    omitted.push({ path: skipped.path, status: skipped.status, size: fileSize(cwd, skipped.path), reason: "file-count-limit" });
  }
  for (const file of processed) {
    const absolutePath = path.resolve(cwd, file.path);
    try {
      const stat = fs.lstatSync(absolutePath);
      // Sensitivity first: git collapses wholly-untracked directories into a
      // single `dir/` entry, so a sensitive directory must be flagged even
      // though it is not a regular file.
      if (isSensitivePath(file.path)) {
        sensitiveFiles.push(sensitiveMetadata(cwd, file.path, file.status));
        patchComplete = false;
        omitted.push({ path: file.path, status: file.status, size: stat.isFile() ? stat.size : 0, reason: "sensitive" });
        continue;
      }
      if (!stat.isFile()) {
        patchComplete = false;
        omitted.push({ path: file.path, status: file.status, size: 0, reason: "not-a-regular-file" });
        continue;
      }
      if (stat.size > MAX_UNTRACKED_PATCH_FILE) {
        patchComplete = false;
        omitted.push({ path: file.path, status: file.status, size: stat.size, reason: "file-too-large" });
        continue;
      }
      const data = fs.readFileSync(absolutePath);
      if (data.includes(0)) {
        binaryFiles.push(binaryMetadata(cwd, file.path, file.status));
        patchComplete = false;
        omitted.push({ path: file.path, status: file.status, size: stat.size, reason: "binary" });
        continue;
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      // Both aggregate gates run BEFORE anything is persisted: an omitted
      // file must cost the reviewer nothing but metadata. The synthetic patch
      // string is built transiently only to measure it against the cap.
      const lines = text.split("\n");
      const synthetic = `diff --git a/${file.path} b/${file.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${file.path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}`;
      if (patchChars + synthetic.length > MAX_UNTRACKED_PATCH_TOTAL) {
        truncated = true;
        patchComplete = false;
        omitted.push({ path: file.path, status: file.status, size: stat.size, reason: "aggregate-patch-limit" });
        continue;
      }
      const remaining = MAX_UNTRACKED_TOTAL - totalChars;
      if (remaining <= 0) {
        truncated = true;
        patchComplete = false;
        omitted.push({ path: file.path, status: file.status, size: stat.size, reason: "aggregate-content-limit" });
        // Reserve the patch budget this file would have cost: without this,
        // the aggregate patch cap would be unreachable (content cap < patch
        // cap), and the persisted `patches` array still carries zero bytes
        // for the omitted file.
        patchChars += synthetic.length;
        continue;
      }
      patches.push(synthetic);
      patchChars += synthetic.length;
      const bounded = truncateText(text, Math.min(MAX_UNTRACKED_CONTENT, remaining));
      content.push({ path: file.path, content: bounded.content, truncated: bounded.truncated });
      totalChars += bounded.content.length;
      if (bounded.truncated) {
        truncated = true;
        patchComplete = false;
        omitted.push({ path: file.path, status: file.status, size: stat.size, reason: "per-file-content-truncated" });
      }
    } catch {
      patchComplete = false;
      omitted.push({ path: file.path, status: file.status, size: 0, reason: "unreadable" });
    }
  }
  return { content, binaryFiles, sensitiveFiles, omitted, truncated, patchComplete, patches, patchChars, processedFiles: processed.length };
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

function diffBlockPaths(block) {
  const header = String(block || "").split("\n")[0] || "";
  const tokens = header.match(/"[^"]*"|\S+/gu) || [];
  if (tokens.length < 4 || tokens[0] !== "diff" || tokens[1] !== "--git") return [];
  const strip = (token) => String(token || "").replace(/^"/u, "").replace(/"$/u, "").replace(/^[ab]\//u, "");
  return [strip(tokens[2]), strip(tokens[3])];
}

function sanitizePatch(patch, sensitivePaths) {
  if (!patch) return "";
  if (sensitivePaths.length === 0) return patch;
  const sensitive = new Set(sensitivePaths);
  return patch.split(/(?=^diff --git )/mu).filter((block) => {
    const paths = diffBlockPaths(block);
    // Fail closed: a block whose paths cannot be attributed is dropped
    // whenever any sensitive path exists in this ChangeSet.
    if (paths.length === 0) return false;
    return !paths.some((filePath) => sensitive.has(filePath));
  }).join("");
}

function diff(cwd) {
  const names = runGit(["diff", "--name-status", "-z"], cwd);
  const stagedNames = runGit(["diff", "--cached", "--name-status", "-z"], cwd);
  // Enumerate untracked files individually: without --untracked-files=all git
  // collapses a wholly-untracked directory into a single `dir/` entry and the
  // reviewer would lose the inner files. Limits below still bound the result.
  const statusOutput = runGit(["status", "--porcelain=v1", "--untracked-files=all", "-z"], cwd);
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
  const workingTreePatch = rawWorkingTreePatch === null ? null : sanitizePatch(rawWorkingTreePatch, sensitivePaths);
  const stagedPatch = rawStagedPatch === null ? null : sanitizePatch(rawStagedPatch, sensitivePaths);
  // A failed patch capture (null) must fail the ChangeSet: reporting an empty
  // patch as complete would let the reviewer approve unseen changes.
  const available = names !== null && stagedNames !== null && statusOutput !== null && statsOutput !== null && stagedStatsOutput !== null && rawWorkingTreePatch !== null && rawStagedPatch !== null;
  const omitted = [...untracked.omitted];
  for (const item of binaryFiles) {
    if (!omitted.some((entry) => entry.path === item.path)) omitted.push({ path: item.path, status: item.status, size: item.size, reason: "binary" });
  }
  for (const item of sensitiveFiles) {
    if (!omitted.some((entry) => entry.path === item.path)) omitted.push({ path: item.path, status: item.status, size: item.size, reason: "sensitive" });
  }
  // Defense in depth: the joined reviewer patch never carries sensitive bytes,
  // even if a synthetic block format changes in the future.
  const patch = sanitizePatch([workingTreePatch, stagedPatch, ...untracked.patches].filter(Boolean).join("\n"), sensitivePaths);
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
    omitted,
    limits: {
      maxUntrackedContent: MAX_UNTRACKED_CONTENT,
      maxUntrackedPatchFile: MAX_UNTRACKED_PATCH_FILE,
      maxUntrackedTotal: MAX_UNTRACKED_TOTAL,
      maxUntrackedFiles: MAX_UNTRACKED_FILES,
      maxUntrackedPatchTotal: MAX_UNTRACKED_PATCH_TOTAL,
      untrackedFilesProcessed: untracked.processedFiles,
      untrackedFilesOmitted: Math.max(0, statusFiles.filter((item) => item.status === "??").length - untracked.processedFiles),
      untrackedPatchChars: untracked.patchChars,
      omittedFiles: omitted.length
    },
    patch
  };
}

module.exports = { diff, snapshot, parseNameStatus, parseStatusPorcelain, MAX_UNTRACKED_CONTENT, MAX_UNTRACKED_PATCH_FILE, MAX_UNTRACKED_TOTAL, MAX_UNTRACKED_FILES, MAX_UNTRACKED_PATCH_TOTAL, isSensitivePath };
