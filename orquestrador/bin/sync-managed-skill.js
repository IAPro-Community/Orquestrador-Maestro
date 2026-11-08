#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STATE_FILE = ".orquestrador-managed-skills.json";
const STATE_VERSION = 1;
const HASH_PATTERN = /^[a-f0-9]{64}$/iu;

function lstatOrNull(target) {
  try { return fs.lstatSync(target); }
  catch (error) { if (error && error.code === "ENOENT") return null; throw error; }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function treeEntries(root) {
  const rootInfo = lstatOrNull(root);
  if (!rootInfo || rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new Error(`Skill source or destination must be a real directory: ${root}`);
  }
  const entries = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const info = fs.lstatSync(absolute);
      if (info.isSymbolicLink()) {
        entries.push({ relative, type: "symlink", value: fs.readlinkSync(absolute) });
      } else if (info.isDirectory()) {
        entries.push({ relative, type: "directory", value: "" });
        walk(absolute);
      } else if (info.isFile()) {
        entries.push({ relative, type: "file", value: fs.readFileSync(absolute) });
      } else {
        throw new Error(`Unsupported filesystem entry inside skill: ${relative}`);
      }
    }
  };
  walk(root);
  return entries.sort((left, right) => left.relative.localeCompare(right.relative));
}

function treeHash(root) {
  const hash = crypto.createHash("sha256");
  for (const entry of treeEntries(root)) {
    hash.update(entry.relative).update("\0").update(entry.type).update("\0");
    if (entry.type === "file") hash.update(entry.value);
    else hash.update(entry.value, "utf8");
    hash.update("\0");
  }
  return hash.digest("hex");
}

function ensureDirectory(root) {
  const absolute = path.resolve(root);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = lstatOrNull(current);
    if (info && (info.isSymbolicLink() || !info.isDirectory())) {
      throw new Error(`Unsafe directory path: ${current}`);
    }
    if (!info) fs.mkdirSync(current);
  }
  return absolute;
}

function readState(root) {
  const statePath = path.join(root, STATE_FILE);
  const info = lstatOrNull(statePath);
  if (!info) return { version: STATE_VERSION, skills: Object.create(null) };
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`Unsafe skill sync state: ${statePath}`);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  if (state.version !== STATE_VERSION || !state.skills || typeof state.skills !== "object" || Array.isArray(state.skills)) {
    throw new Error(`Unsupported skill sync state at ${statePath}; refusing destructive sync.`);
  }
  for (const [name, entry] of Object.entries(state.skills)) {
    if (!/^[A-Za-z0-9._-]+$/u.test(name) || !entry || typeof entry !== "object" ||
        !HASH_PATTERN.test(entry.sourceTreeSha256 || "") || !HASH_PATTERN.test(entry.installedTreeSha256 || "") ||
        typeof entry.customized !== "boolean") {
      throw new Error(`Invalid skill sync state entry: ${name}`);
    }
  }
  return state;
}

function writeState(root, state) {
  const target = path.join(root, STATE_FILE);
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (lstatOrNull(target)) fs.rmSync(target, { force: true });
    fs.renameSync(temp, target);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}

function ensureArtifacts(root) {
  return ensureDirectory(root);
}

function createDefaultArtifacts(targetRoot) {
  const home = path.dirname(path.dirname(path.resolve(targetRoot)));
  const backupRoot = ensureDirectory(path.join(home, ".orquestrador-public-backups"));
  const name = `native-skills-${new Date().toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14)}-${process.pid}-${crypto.randomUUID().replace(/-/gu, "").slice(0, 12)}`;
  return path.join(backupRoot, name);
}

function previousSourceMatches(previousRoot, skill, currentHash) {
  if (!previousRoot) return false;
  const candidates = [
    path.join(previousRoot, "skills", skill),
    path.join(previousRoot, "skill-library", "community-skills", skill),
    path.join(previousRoot, "skill-library", "codex-skills", skill),
  ];
  for (const candidate of candidates) {
    const info = lstatOrNull(candidate);
    if (!info || info.isSymbolicLink() || !info.isDirectory()) continue;
    if (treeHash(candidate) === currentHash) return true;
  }
  return false;
}

function copyUpstream(source, artifactsRoot, program, skill, sourceHash) {
  const relative = `upstream-overrides/native-skills/${program}/${skill}-${sourceHash.slice(0, 12)}`;
  const destination = path.join(artifactsRoot, ...relative.split("/"));
  const existing = lstatOrNull(destination);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isDirectory() || treeHash(destination) !== sourceHash) {
      throw new Error(`Refusing to replace an existing upstream copy: ${destination}`);
    }
    return relative;
  }
  ensureDirectory(path.dirname(destination));
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
  return relative;
}

function copyPrevious(destination, artifactsRoot, program, skill, installedHash) {
  const relative = `native-skills-before/${program}/${skill}-${installedHash.slice(0, 12)}`;
  const artifact = path.join(artifactsRoot, ...relative.split("/"));
  const existing = lstatOrNull(artifact);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isDirectory() || treeHash(artifact) !== installedHash) {
      throw new Error(`Refusing to replace an existing pre-update copy: ${artifact}`);
    }
    return relative;
  }
  ensureDirectory(path.dirname(artifact));
  fs.cpSync(destination, artifact, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
  return relative;
}

function recordReport(artifactsRoot, operation) {
  return recordReports(artifactsRoot, [operation]);
}

function recordReports(artifactsRoot, operations) {
  const reportPath = path.join(artifactsRoot, "native-skills-report.json");
  let report = { schemaVersion: 1, kind: "orquestrador-native-skill-update-report", generatedAt: new Date().toISOString(), operations: [] };
  const existing = lstatOrNull(reportPath);
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isFile()) throw new Error(`Unsafe native skill report: ${reportPath}`);
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.schemaVersion !== 1 || !Array.isArray(report.operations)) throw new Error(`Unsupported native skill report: ${reportPath}`);
  }
  report.generatedAt = new Date().toISOString();
  report.operations.push(...operations);
  const temp = `${reportPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    if (lstatOrNull(reportPath)) fs.rmSync(reportPath, { force: true });
    fs.renameSync(temp, reportPath);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}

function replaceDirectory(source, destination, targetRoot, expectedCurrentHash) {
  const parent = path.dirname(destination);
  if (path.resolve(parent) !== path.resolve(targetRoot)) throw new Error("Skill destinations must be direct children of their native root.");
  const stage = `${destination}.maestro-stage-${process.pid}-${crypto.randomUUID()}`;
  const previous = `${destination}.maestro-previous-${process.pid}-${crypto.randomUUID()}`;
  fs.cpSync(source, stage, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
  try {
    if (treeHash(destination) !== expectedCurrentHash) throw new Error("Skill changed during synchronization; refusing to replace it.");
    fs.renameSync(destination, previous);
    try { fs.renameSync(stage, destination); }
    catch (error) { fs.renameSync(previous, destination); throw error; }
  } catch (error) {
    if (lstatOrNull(stage)) fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(previous, { recursive: true, force: true });
}

function applyManagedSkill({ program, source, destination, targetRoot, artifactsDirectory, previousRoot,
  stateCache = null, reportCache = null, precomputedSourceHash = null }) {
  if (!/^[A-Za-z0-9._-]+$/u.test(program) || !/^[A-Za-z0-9._-]+$/u.test(path.basename(destination))) {
    throw new Error("Program and skill identifiers must contain only letters, digits, dots, underscores or hyphens.");
  }
  const root = ensureDirectory(targetRoot);
  const sourcePath = path.resolve(source);
  const destinationPath = path.resolve(destination);
  if (path.dirname(destinationPath) !== root) throw new Error("Skill destination must be a direct child of its native root.");
  const sourceHash = precomputedSourceHash || treeHash(sourcePath);
  let state = stateCache ? stateCache.get(root) : null;
  if (!state) {
    state = readState(root);
    if (stateCache) stateCache.set(root, state);
  }
  const skill = path.basename(destinationPath);
  const previousEntry = state.skills[skill] || null;
  const destInfo = lstatOrNull(destinationPath);
  let action;
  let installedHash = sourceHash;
  let upstreamCopy = null;
  let previousCopy = null;
  let previousTreeHash = null;
  let artifactsRoot = artifactsDirectory ? path.resolve(artifactsDirectory) : (process.env.ORQUESTRADOR_UPDATE_ARTIFACTS ? path.resolve(process.env.ORQUESTRADOR_UPDATE_ARTIFACTS) : null);
  for (const candidate of [root, sourcePath, destinationPath]) {
    if (artifactsRoot && (path.resolve(artifactsRoot) === candidate || path.resolve(artifactsRoot).startsWith(candidate + path.sep))) {
      throw new Error("Update artifacts must be stored outside the source and native skill directories.");
    }
  }

  if (!destInfo) {
    const stage = `${destinationPath}.maestro-stage-${process.pid}-${crypto.randomUUID()}`;
    fs.cpSync(sourcePath, stage, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    try { fs.renameSync(stage, destinationPath); }
    catch (error) { try { fs.rmSync(stage, { recursive: true, force: true }); } catch {} throw error; }
    action = "copied";
  } else {
    if (destInfo.isSymbolicLink() || !destInfo.isDirectory()) throw new Error(`Refusing to replace a non-directory skill destination: ${destinationPath}`);
    const currentHash = treeHash(destinationPath);
    installedHash = currentHash;
    const matchesPreviousPackage = !previousEntry && previousSourceMatches(previousRoot || process.env.ORQUESTRADOR_PREVIOUS_ROOT, skill, currentHash);
    const cleanFromPreviousInstall = Boolean(previousEntry && !previousEntry.customized && currentHash === previousEntry.installedTreeSha256);
    const clean = currentHash === sourceHash || cleanFromPreviousInstall || matchesPreviousPackage;

    if (clean && currentHash !== sourceHash) {
      artifactsRoot = artifactsRoot || createDefaultArtifacts(root);
      artifactsRoot = ensureArtifacts(artifactsRoot);
      previousTreeHash = currentHash;
      previousCopy = copyPrevious(destinationPath, artifactsRoot, program, skill, currentHash);
      replaceDirectory(sourcePath, destinationPath, root, currentHash);
      installedHash = sourceHash;
      action = "updated";
    } else if (clean) {
      installedHash = sourceHash;
      action = "unchanged";
    } else {
      artifactsRoot = artifactsRoot || createDefaultArtifacts(root);
      artifactsRoot = ensureArtifacts(artifactsRoot);
      upstreamCopy = copyUpstream(sourcePath, artifactsRoot, program, skill, sourceHash);
      action = "preserved-customization";
    }
  }

  const customized = action === "preserved-customization";
  state.skills[skill] = {
    sourceTreeSha256: sourceHash,
    installedTreeSha256: installedHash,
    customized,
    updatedAt: new Date().toISOString(),
  };
  if (!stateCache) writeState(root, state);

  if (artifactsRoot) {
    artifactsRoot = ensureArtifacts(artifactsRoot);
    const home = path.dirname(path.dirname(root));
    const relativeTargetRoot = path.relative(home, root).split(path.sep).join("/");
    const reportOperation = {
      program,
      skill,
      targetRoot: relativeTargetRoot,
      action,
      sourceTreeSha256: sourceHash,
      installedTreeSha256: installedHash,
      previousTreeSha256: previousTreeHash,
      previousCopy,
      upstreamCopy,
    };
    if (reportCache) {
      const operations = reportCache.get(artifactsRoot) || [];
      operations.push(reportOperation);
      reportCache.set(artifactsRoot, operations);
    } else {
      recordReport(artifactsRoot, reportOperation);
    }
  }
  return { action, sourceTreeSha256: sourceHash, installedTreeSha256: installedHash, upstreamCopy, reportPath: artifactsRoot ? path.join(artifactsRoot, "native-skills-report.json") : null };
}

function applyBatch(operations) {
  if (!Array.isArray(operations)) throw new TypeError("Native skill batch must be an array.");
  const results = [];
  const stateCache = new Map();
  const reportCache = new Map();
  const sourceHashes = new Map();
  const stateSnapshots = new Set();
  for (const operation of operations) {
    if (!operation || typeof operation !== "object") throw new TypeError("Native skill batch contains an invalid operation.");
    const operationArtifacts = operation.artifactsDirectory || process.env.ORQUESTRADOR_UPDATE_ARTIFACTS || null;
    const rootKey = path.resolve(operation.targetRoot);
    if (operationArtifacts && !stateSnapshots.has(rootKey)) {
      const artifactsRoot = ensureArtifacts(path.resolve(operationArtifacts));
      const root = ensureDirectory(rootKey);
      const program = operation.program;
      const statePath = path.join(root, STATE_FILE);
      const stateInfo = lstatOrNull(statePath);
      if (stateInfo && (stateInfo.isSymbolicLink() || !stateInfo.isFile())) {
        throw new Error(`Unsafe skill sync state: ${statePath}`);
      }
      const relative = stateInfo
        ? `native-skill-state-before/${program}.json`
        : `native-skill-state-before/${program}.absent`;
      const snapshotPath = path.join(artifactsRoot, ...relative.split("/"));
      ensureDirectory(path.dirname(snapshotPath));
      if (!lstatOrNull(snapshotPath)) {
        if (stateInfo) fs.copyFileSync(statePath, snapshotPath, fs.constants.COPYFILE_EXCL);
        else fs.writeFileSync(snapshotPath, "", { encoding: "utf8", flag: "wx", mode: 0o600 });
      }
      stateSnapshots.add(rootKey);
    }
    const source = path.resolve(operation.source);
    if (!sourceHashes.has(source)) sourceHashes.set(source, treeHash(source));
    const result = applyManagedSkill({
      program: operation.program,
      source: operation.source,
      destination: operation.destination,
      targetRoot: operation.targetRoot,
      artifactsDirectory: operation.artifactsDirectory || null,
      previousRoot: operation.previousRoot || null,
      stateCache,
      reportCache,
      precomputedSourceHash: sourceHashes.get(source),
    });
    results.push({ program: operation.program, skill: operation.skill || path.basename(operation.destination), action: result.action });
  }
  for (const [root, state] of stateCache) writeState(root, state);
  for (const [artifactsRoot, reportOperations] of reportCache) {
    recordReports(artifactsRoot, reportOperations);
  }
  return results;
}

function inspectRoot(root) {
  const absoluteRoot = path.resolve(root);
  const rootInfo = lstatOrNull(absoluteRoot);
  if (!rootInfo || rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    return { version: null, supported: false, missing: [], modified: [], customizations: [] };
  }
  try {
    const state = readState(absoluteRoot);
    const missing = [];
    const modified = [];
    const customizations = [];
    for (const [skill, entry] of Object.entries(state.skills)) {
      const destination = path.join(absoluteRoot, skill);
      const info = lstatOrNull(destination);
      if (!info || info.isSymbolicLink() || !info.isDirectory()) { missing.push(skill); continue; }
      const currentHash = treeHash(destination);
      if (currentHash !== entry.installedTreeSha256) modified.push(skill);
      else if (entry.customized) customizations.push(skill);
    }
    return {
      version: state.version,
      supported: true,
      missing: missing.sort(),
      modified: modified.sort(),
      customizations: customizations.sort(),
    };
  } catch (error) {
    return { version: null, supported: false, missing: [], modified: [], customizations: [], error: error.message };
  }
}

function main(argv) {
  const [mode, program, source, destination, targetRoot, artifactsDirectory, previousRoot] = argv;
  if (mode === "apply-batch" && program === "--nul") {
    const fields = fs.readFileSync(0).toString("utf8").split("\0");
    if (fields.at(-1) === "") fields.pop();
    if (fields.length % 5 !== 0) throw new Error("Malformed NUL-delimited native skill batch.");
    const operations = [];
    for (let index = 0; index < fields.length; index += 5) {
      const [operationProgram, skill, operationSource, operationDestination, operationRoot] = fields.slice(index, index + 5);
      operations.push({ program: operationProgram, skill, source: operationSource, destination: operationDestination, targetRoot: operationRoot });
    }
    for (const result of applyBatch(operations)) process.stdout.write(`${result.program}|${result.skill}|${result.action}\n`);
    return 0;
  }
  if (mode === "apply-batch" && program === "--json-file" && source) {
    const raw = fs.readFileSync(source, "utf8").replace(/^\uFEFF/u, "");
    process.stdout.write(`${JSON.stringify(applyBatch(JSON.parse(raw)))}\n`);
    return 0;
  }
  if (mode === "inspect-root" && program) {
    process.stdout.write(`${JSON.stringify(inspectRoot(program))}\n`);
    return 0;
  }
  if (mode !== "apply" || !program || !source || !destination || !targetRoot) {
    throw new Error("Usage: sync-managed-skill.js apply <program> <source> <destination> <native-root> [artifacts-dir] [previous-core-root] | apply-batch --nul|--json-file <input>");
  }
  const result = applyManagedSkill({ program, source, destination, targetRoot, artifactsDirectory: artifactsDirectory || null, previousRoot: previousRoot || null });
  process.stdout.write(`${result.action}\n`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`sync-managed-skill: ${error.message}`); process.exitCode = 1; }
}

module.exports = { STATE_FILE, STATE_VERSION, treeHash, readState, applyManagedSkill, applyBatch, inspectRoot, main };
