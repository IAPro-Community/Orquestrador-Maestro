#!/usr/bin/env node
"use strict";

// Installs (or backs up) a tool-profile file without destroying user content.
//
// Three modes, chosen from what is on disk:
//   install : destination missing        -> write the rendered template
//   merge   : destination is strict JSON -> deep-merge the template into it, so
//             user-owned root keys (for example an OpenCode `provider` block)
//             survive a reinstall while template keys still win recursively
//   orphan  : destination is not JSON    -> never overwrite; emit a warning
//
// Before any write in install/merge mode the existing file is copied into the
// install backup directory, so an upgrade can always be rolled back.
//
// Usage: install-profile-file.js install|backup <source> <destination> <backup-dir>

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function atomicWriteFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(temp, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temp, filePath);
}

function mergeDeep(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeDeep(out[key], value) : value;
  }
  return out;
}

// Arrays are replaced wholesale: they carry ordered selections (instructions,
// plugins, model lists), so merging them would resurrect stale entries.
function copyTree(sourceDir, backupDir) {
  const backupStat = lstatOrNull(backupDir);
  if (backupStat && backupStat.isSymbolicLink()) {
    throw new Error(`Refusing symbolic backup directory: ${backupDir}`);
  }
  if (!backupStat) fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(backupDir, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function warn(message) {
  process.stderr.write(`Warning: ${message}\n`);
}

function assertSafeDestination(target) {
  const stats = lstatOrNull(target);
  if (stats && stats.isSymbolicLink()) {
    throw new Error(`Refusing to operate on symbolic link: ${target}`);
  }
  return stats;
}

function ensureSafeBackupDir(backupDir) {
  const stats = lstatOrNull(backupDir);
  if (stats && stats.isSymbolicLink()) {
    throw new Error(`Refusing symbolic backup directory: ${backupDir}`);
  }
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
}

function main(argv) {
  const [mode, source, destination, backupDir] = argv;
  if (!["install", "backup"].includes(mode) || !source || !destination) {
    throw new Error("Usage: install-profile-file.js install|backup <source> <destination> <backup-dir>");
  }
  const stats = assertSafeDestination(destination);

  if (mode === "backup") {
    if (!stats) return;
    if (!backupDir) throw new Error("backup mode requires a backup directory");
    if (stats.isDirectory()) copyTree(destination, backupDir);
    else {
      ensureSafeBackupDir(backupDir);
      fs.copyFileSync(destination, path.join(backupDir, path.basename(destination)));
    }
    return;
  }

  const template = fs.readFileSync(source, "utf8");
  if (!stats) {
    atomicWriteFile(destination, template);
    return;
  }

  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(destination, "utf8"));
  } catch {
    warn(`existing file is not strict JSON; left untouched (template: ${source})`);
    return;
  }
  if (!isPlainObject(existing)) {
    warn(`existing JSON is not an object; left untouched (template: ${source})`);
    return;
  }

  let overlay;
  try {
    overlay = JSON.parse(template);
  } catch (error) {
    throw new Error(`Tool-profile template is not valid JSON (${source}): ${error.message}`);
  }
  if (!isPlainObject(overlay)) throw new Error(`Tool-profile template must be a JSON object (${source})`);

  if (backupDir) {
    ensureSafeBackupDir(backupDir);
    fs.copyFileSync(destination, path.join(backupDir, path.basename(destination)));
  }
  const merged = mergeDeep(existing, overlay);
  // Migrate only known Maestro paths, not arbitrary user instructions.
  if (path.basename(destination) === "opencode.json" &&
      overlay.$schema === "https://opencode.ai/config.json" &&
      Array.isArray(overlay.instructions) && overlay.instructions.length === 1 &&
      overlay.instructions[0] === "~/AGENTS.md" && Array.isArray(existing.instructions)) {
    const legacy = new Set([
      "~/AGENTS.md", "~/.orquestrador/rules.md", "~/.orquestrador/maestro.md",
      "~/.orquestrador/SKILLS_INDEX.md", "~/.orquestrador/SKILLS_ROUTER.json",
      "~/.orquestrador-maestro/rules.md", "~/.orquestrador-maestro/maestro.md",
      "~/.orquestrador-maestro/SKILLS_INDEX.md", "~/.orquestrador-maestro/SKILLS_ROUTER.json",
      "~/.opencode/SYSTEM.md", "~/.opencode/rules.md", "~/.opencode/hooks.md"
    ]);
    merged.instructions = [...new Set([
      ...overlay.instructions,
      ...existing.instructions.filter(entry => !legacy.has(entry))
    ])];
  }
  if (JSON.stringify(merged) === JSON.stringify(existing)) return;
  atomicWriteFile(destination, `${JSON.stringify(merged, null, 2)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
}