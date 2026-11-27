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
// Usage: install-profile-file.js install|backup <source> <destination> <backup-dir> [--warn-file PATH]

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
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeDeep(out[key], value) : value;
  }
  return out;
}

// Arrays are replaced wholesale: they carry ordered selections (instructions,
// plugins, model lists), so merging them would resurrect stale entries.
function copyTree(sourceDir, backupDir) {
  if (!lstatOrNull(backupDir)) fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
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

function warn(target, message) {
  process.stderr.write(`Warning: ${message}\n`);
}

function main(argv) {
  const [mode, source, destination, backupDir] = argv;
  if (!["install", "backup"].includes(mode) || !source || !destination) {
    throw new Error("Usage: install-profile-file.js install|backup <source> <destination> <backup-dir>");
  }
  const stats = lstatOrNull(destination);

  if (mode === "backup") {
    if (!stats) return;
    if (!backupDir) throw new Error("backup mode requires a backup directory");
    if (stats.isDirectory()) copyTree(destination, backupDir);
    else {
      fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
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
    warn(destination, `existing file is not strict JSON; left untouched (template: ${source})`);
    return;
  }
  if (!isPlainObject(existing)) {
    warn(destination, `existing JSON is not an object; left untouched (template: ${source})`);
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
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    fs.copyFileSync(destination, path.join(backupDir, path.basename(destination)));
  }
  const merged = mergeDeep(existing, overlay);
  if (JSON.stringify(merged) === JSON.stringify(existing)) return;
  atomicWriteFile(destination, `${JSON.stringify(merged, null, 2)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
}