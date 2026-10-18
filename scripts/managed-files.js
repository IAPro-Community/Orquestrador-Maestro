#!/usr/bin/env node
"use strict";

// Source-owned manifest: never infer ownership from files in the user's home.
// V1 listed personal files as well as package files; it can guide collision
// checks but is never trusted for deletion. V3 records the package hash even
// when a user override is preserved in the installed tree.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MANIFEST = "MANAGED_FILES.json";
const MANIFEST_VERSION = 3;
const HASH_PATTERN = /^[a-f0-9]{64}$/iu;

function lstatOrNull(target) {
  try { return fs.lstatSync(target); }
  catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
}

function sourceFiles(source) {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (dir === source && (entry.name === "logs" || entry.name === "runtime")) continue;
        walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(source, full).split(path.sep).join("/");
        if (rel !== MANIFEST) names.add(rel);
      }
    }
  };
  walk(source);
  return names;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeParts(rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\\") || rel.includes("\0")) return null;
  const parts = rel.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) return null;
  return parts;
}

function safePath(target, rel, finalType) {
  const parts = safeParts(rel);
  if (!parts) return null;
  const root = path.resolve(target);
  if (fs.existsSync(root)) {
    const rootInfo = fs.lstatSync(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) return null;
  }
  const dest = path.resolve(root, ...parts);
  if (!dest.startsWith(root + path.sep)) return null;

  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink() || !info.isDirectory()) return null;
  }

  if (fs.existsSync(dest)) {
    const info = fs.lstatSync(dest);
    if (info.isSymbolicLink()) return null;
    if (finalType === "file" && !info.isFile()) return null;
    if (finalType === "directory" && !info.isDirectory()) return null;
  }
  return dest;
}

function safeDestination(target, rel) {
  return safePath(target, rel, "file");
}

function safeDirectoryDestination(target, rel) {
  return safePath(target, rel, "directory");
}

function readManifest(root) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), "utf8"));
    if (!Number.isInteger(value.version) || value.version < 1 || !value.files ||
        typeof value.files !== "object" || Array.isArray(value.files)) return null;
    return value;
  } catch { return null; }
}

function expectedHash(manifest, metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const digest = manifest?.version === 3 ? (metadata.sourceSha256 || metadata.sha256) : metadata.sha256;
  return typeof digest === "string" && HASH_PATTERN.test(digest) ? digest.toLowerCase() : null;
}

function readJsonVersion(root, name) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
    const version = value.schemaVersion ?? value.version;
    return Number.isInteger(version) && version >= 0 ? version : null;
  } catch { return null; }
}

function versionSummary(root, manifest) {
  return {
    managedFiles: manifest?.version ?? null,
    router: readJsonVersion(root, "SKILLS_ROUTER.json"),
    skillManifest: readJsonVersion(root, "SKILLS_MANIFEST.json"),
    updateMigrationPolicy: readJsonVersion(root, "UPDATE_MIGRATION_POLICY.json"),
    config: readJsonVersion(root, "config.json") ?? 0,
  };
}

function ensureArtifactRoot(root) {
  const absolute = path.resolve(root);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      const info = fs.lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Unsafe update artifact path: ${current}`);
    } else {
      fs.mkdirSync(current);
    }
  }
  return absolute;
}

function writeArtifact(root, rel, source) {
  const destination = safeDestination(root, rel);
  if (!destination) throw new Error(`Unsafe update artifact destination: ${rel}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return path.relative(root, destination).split(path.sep).join("/");
}

function sourceDiff(oldRoot, stagedRoot, oldManifest, currentManagedFiles) {
  const result = { added: [], updated: [], removed: [] };
  if (!oldManifest || oldManifest.version < 2) return result;
  const oldFiles = oldManifest.files;
  for (const rel of currentManagedFiles) {
    const next = safeDestination(stagedRoot, rel);
    const nextHash = next && fs.existsSync(next) ? sha256(next) : null;
    const previousHash = expectedHash(oldManifest, oldFiles[rel]);
    if (!Object.hasOwn(oldFiles, rel)) result.added.push(rel);
    else if (nextHash && previousHash && nextHash !== previousHash) result.updated.push(rel);
  }
  for (const rel of Object.keys(oldFiles)) {
    if (!currentManagedFiles.has(rel)) result.removed.push(rel);
  }
  for (const values of Object.values(result)) values.sort();
  return result;
}

function preserveUserFiles(oldRoot, stagedRoot, artifactsDirectory = null) {
  const manifest = readManifest(oldRoot);
  const trustedOwnership = manifest && manifest.version >= 2;
  const nextFiles = sourceFiles(stagedRoot);
  const changes = sourceDiff(oldRoot, stagedRoot, manifest, nextFiles);
  const report = {
    schemaVersion: 1,
    kind: "orquestrador-update-report",
    generatedAt: new Date().toISOString(),
    baseline: !manifest ? "unknown" : manifest.version === 1 ? "legacy-v1-untrusted" : `managed-files-v${manifest.version}`,
    versions: {
      previous: versionSummary(oldRoot, manifest),
      current: versionSummary(stagedRoot, { version: MANIFEST_VERSION }),
    },
    packageChanges: changes,
    preservedUserFiles: [],
    preservedDirectories: [],
    preservedManagedOverrides: [],
    retiredManagedFiles: [],
    preservedLegacyFiles: [],
    unresolvedConflicts: [],
  };
  let artifactsRoot = null;
  if (artifactsDirectory) {
    artifactsRoot = ensureArtifactRoot(artifactsDirectory);
    const oldPath = path.resolve(oldRoot);
    const newPath = path.resolve(stagedRoot);
    if (artifactsRoot === oldPath || artifactsRoot.startsWith(oldPath + path.sep) ||
        artifactsRoot === newPath || artifactsRoot.startsWith(newPath + path.sep)) {
      throw new Error("Update artifacts must be stored outside the active and staged Maestro roots");
    }
  }

  const customDirectories = [];
  const saveUpstream = (rel, source) => {
    if (!artifactsRoot) {
      report.unresolvedConflicts.push({ path: rel, reason: "upstream-copy-directory-not-provided" });
      return null;
    }
    return writeArtifact(artifactsRoot, `upstream-overrides/${rel}`, source);
  };

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const src = path.join(dir, entry.name);
      const rel = path.relative(oldRoot, src).split(path.sep).join("/");
      if (rel === MANIFEST || rel === "logs" || rel.startsWith("logs/")) continue;
      // Config sources were merged and migrated before this pass. Copying an
      // individual legacy file here would undo canonical precedence.
      if (rel === "config.json" && fs.existsSync(path.join(stagedRoot, rel))) continue;
      if (entry.isSymbolicLink()) {
        report.unresolvedConflicts.push({ path: rel, reason: "symbolic-link-preserved-in-backup-only" });
        continue;
      }
      if (entry.isDirectory()) {
        customDirectories.push(rel);
        walk(src);
        continue;
      }
      if (!entry.isFile()) continue;

      const dest = safeDestination(stagedRoot, rel);
      const oldMeta = manifest && Object.hasOwn(manifest.files, rel) ? manifest.files[rel] : null;
      const oldHash = expectedHash(manifest, oldMeta);
      const oldFileHash = sha256(src);
      const unchangedFromRecordedVersion = Boolean(oldHash && oldFileHash === oldHash);
      const knownManaged = Boolean(trustedOwnership && oldMeta && oldHash);

      if (dest && fs.existsSync(dest)) {
        // For source-owned v2/v3 files, a matching previous source hash means
        // the user has not customized the file. V1 hashes are usable only as
        // a change baseline; they never authorize deletion.
        if ((knownManaged || (manifest?.version === 1 && oldMeta)) && unchangedFromRecordedVersion) continue;

        const upstreamCopy = sha256(dest) === oldFileHash ? null : saveUpstream(rel, dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        try { fs.chmodSync(dest, fs.statSync(src).mode); } catch {}
        report.preservedUserFiles.push(rel);
        if (knownManaged) report.preservedManagedOverrides.push({ path: rel, upstreamCopy });
        else if (manifest?.version === 1 && oldMeta) report.preservedLegacyFiles.push(rel);
        else report.unresolvedConflicts.push({ path: rel, reason: "user-file-collides-with-new-package-file", upstreamCopy });
        continue;
      }

      if (knownManaged && unchangedFromRecordedVersion && !nextFiles.has(rel)) {
        report.retiredManagedFiles.push(rel);
        continue;
      }

      if (!dest) {
        // A file/directory type change cannot be represented at the original
        // path. Keep the user's bytes in the backup artifacts and say so.
        try {
          const savedAs = artifactsRoot ? writeArtifact(artifactsRoot, `preserved-user-content/${rel}`, src) : null;
          report.unresolvedConflicts.push({ path: rel, reason: "path-type-conflict", savedAs });
        } catch (error) {
          report.unresolvedConflicts.push({ path: rel, reason: "path-type-conflict", error: error.message });
        }
        continue;
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
      try { fs.chmodSync(dest, fs.statSync(src).mode); } catch {}
      report.preservedUserFiles.push(rel);
      if (knownManaged) report.preservedManagedOverrides.push({ path: rel, upstreamCopy: null });
      else if (manifest?.version === 1 && oldMeta) report.preservedLegacyFiles.push(rel);
    }
  };
  walk(oldRoot);

  for (const rel of [...new Set(customDirectories)].sort((a, b) => a.split("/").length - b.split("/").length)) {
    const dest = safeDirectoryDestination(stagedRoot, rel);
    if (dest && !fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
      report.preservedDirectories.push(rel);
    }
  }

  for (const values of [report.preservedUserFiles, report.preservedDirectories, report.retiredManagedFiles,
    report.preservedLegacyFiles]) values.sort();
  report.preservedManagedOverrides.sort((a, b) => a.path.localeCompare(b.path));
  report.unresolvedConflicts.sort((a, b) => a.path.localeCompare(b.path));
  report.summary = {
    added: changes.added.length,
    updated: changes.updated.length,
    removed: changes.removed.length,
    preservedUserFiles: report.preservedUserFiles.length,
    preservedDirectories: report.preservedDirectories.length,
    preservedManagedOverrides: report.preservedManagedOverrides.length,
    retiredManagedFiles: report.retiredManagedFiles.length,
    unresolvedConflicts: report.unresolvedConflicts.length,
  };
  // Preserve the compact result names used by existing callers and tests.
  report.preserved = report.summary.preservedUserFiles;
  report.retired = report.summary.retiredManagedFiles;

  if (artifactsRoot) {
    const reportPath = path.join(artifactsRoot, "update-report.json");
    const temporary = `${reportPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, reportPath);
    } finally { try { fs.unlinkSync(temporary); } catch {} }
    report.reportPath = reportPath;
  }
  return report;
}

function snapshot(source, target) {
  const files = Object.create(null);
  const overrides = Object.create(null);
  for (const rel of sourceFiles(source)) {
    const sourceFile = safeDestination(source, rel);
    const installedFile = safeDestination(target, rel);
    if (!sourceFile || !installedFile || !fs.existsSync(installedFile)) continue;
    const sourceDigest = sha256(sourceFile);
    const installedDigest = sha256(installedFile);
    const bytes = fs.statSync(sourceFile).size;
    files[rel] = { sourceSha256: sourceDigest, bytes };
    if (sourceDigest !== installedDigest) overrides[rel] = { sourceSha256: sourceDigest, installedSha256: installedDigest };
  }
  const manifestPath = path.join(target, MANIFEST);
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({
      version: MANIFEST_VERSION,
      generator: "orquestrador-maestro 1.1.0",
      files,
      overrides,
    }, null, 2));
    fs.renameSync(temporary, manifestPath);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
  return Object.keys(files).length;
}

function prune(source, target) {
  const manifest = readManifest(target);
  if (!manifest || manifest.version < 2) {
    console.log("managed-files: legacy manifest migrated without pruning");
    return 0;
  }
  const next = sourceFiles(source);
  let removed = 0;
  for (const [rel, metadata] of Object.entries(manifest.files)) {
    if (next.has(rel)) continue;
    const dest = safeDestination(target, rel);
    const expected = expectedHash(manifest, metadata);
    if (!dest || !fs.existsSync(dest) || !expected || sha256(dest) !== expected) continue;
    fs.unlinkSync(dest);
    removed += 1;
    console.log(`tombstone removed: ${rel}`);
  }
  return removed;
}

function inspectManagedFiles(root) {
  const manifest = readManifest(root);
  if (!manifest || manifest.version < 2) {
    return { version: manifest?.version ?? null, supported: false, missing: [], modified: [], customizations: [] };
  }
  const missing = [];
  const modified = [];
  const customizations = [];
  for (const [rel, metadata] of Object.entries(manifest.files)) {
    const file = safeDestination(root, rel);
    if (!file || !fs.existsSync(file)) { missing.push(rel); continue; }
    const digest = sha256(file);
    const expected = expectedHash(manifest, metadata);
    if (expected && digest !== expected) {
      const known = manifest.version === 3 && manifest.overrides?.[rel]?.installedSha256 === digest;
      (known ? customizations : modified).push(rel);
    }
  }
  return { version: manifest.version, supported: true, missing: missing.sort(), modified: modified.sort(), customizations: customizations.sort() };
}

function refreshInstalledOverrides(root) {
  const manifest = readManifest(root);
  if (!manifest || manifest.version < 2) return false;
  const files = Object.create(null);
  const overrides = Object.create(null);
  for (const [rel, metadata] of Object.entries(manifest.files)) {
    const sourceSha256 = expectedHash(manifest, metadata);
    const file = safeDestination(root, rel);
    if (!sourceSha256) continue;
    const info = file && lstatOrNull(file);
    files[rel] = { sourceSha256, bytes: metadata.bytes ?? (info && info.isFile() ? info.size : 0) };
    if (!info || !info.isFile()) continue;
    const installedSha256 = sha256(file);
    if (installedSha256 !== sourceSha256) overrides[rel] = { sourceSha256, installedSha256 };
  }
  const target = path.join(root, MANIFEST);
  const targetInfo = lstatOrNull(target);
  if (targetInfo && (targetInfo.isSymbolicLink() || !targetInfo.isFile())) {
    throw new Error(`Unsafe managed files manifest: ${target}`);
  }
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({
      ...manifest,
      version: MANIFEST_VERSION,
      files,
      overrides,
    }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    if (lstatOrNull(target)) fs.unlinkSync(target);
    fs.renameSync(temporary, target);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
  return true;
}

function main(argv) {
  const [mode, sourceArg, targetArg, artifactsArg] = argv;
  if (mode === "inspect" && sourceArg) {
    const root = path.resolve(sourceArg);
    if (!fs.statSync(root).isDirectory()) throw new Error("Installed root must be a directory");
    const report = inspectManagedFiles(root);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.supported && report.missing.length === 0 && report.modified.length === 0 ? 0 : 1;
  }
  if (!["prune", "snapshot", "preserve"].includes(mode) || !sourceArg || !targetArg) {
    throw new Error("Usage: managed-files.js prune|snapshot|preserve <source> <target> [update-artifacts]");
  }
  const source = path.resolve(sourceArg);
  const target = path.resolve(targetArg);
  if (!fs.statSync(source).isDirectory() || !fs.statSync(target).isDirectory()) {
    throw new Error("Source and target must be existing directories");
  }
  if (mode === "preserve") {
    const report = preserveUserFiles(source, target, artifactsArg ? path.resolve(artifactsArg) : null);
    console.log(`Preserved user files: ${report.summary.preservedUserFiles}; preserved managed customizations: ${report.summary.preservedManagedOverrides}; retired unchanged package files: ${report.summary.retiredManagedFiles}`);
    if (report.reportPath) console.log(`Update report: ${report.reportPath}`);
    if (report.summary.unresolvedConflicts > 0) console.warn(`Update report contains ${report.summary.unresolvedConflicts} unresolved path conflict(s).`);
    return report;
  }
  if (mode === "prune") {
    const removed = prune(source, target);
    console.log(`Removed unchanged managed files: ${removed}`);
    return 0;
  }
  const managedCount = snapshot(source, target);
  console.log(`Recorded source-owned files: ${managedCount}`);
  return 0;
}

if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    if (typeof result === "number") process.exitCode = result;
  } catch (error) {
    console.error(`managed-files: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { sourceFiles, safeDestination, safeDirectoryDestination, prune, snapshot, preserveUserFiles, inspectManagedFiles, refreshInstalledOverrides, main };
