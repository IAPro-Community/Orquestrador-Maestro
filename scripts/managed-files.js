#!/usr/bin/env node
"use strict";

// Source-owned manifest: never infer ownership from files in the user's home.
// Version 1 recorded every installed file, including user files. It is unsafe
// to prune from a version 1 manifest; migrate without deleting anything.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MANIFEST = "MANAGED_FILES.json";

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

function safeDestination(target, rel) {
  // Paths are manifest data and must never escape through traversal or links.
  if (typeof rel !== "string" || !rel || rel.includes("\\") ||
      rel.split("/").some((part) => !part || part === "." || part === ".." || part.includes(":"))) return null;
  const root = path.resolve(target);
  const dest = path.resolve(root, rel);
  if (!dest.startsWith(root + path.sep)) return null;
  let dir = path.dirname(dest);
  while (dir !== root) {
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  if (fs.existsSync(dest) && (!fs.lstatSync(dest).isFile() || fs.lstatSync(dest).isSymbolicLink())) return null;
  return dest;
}

function prune(source, target) {
  const manifestPath = path.join(target, MANIFEST);
  if (!fs.existsSync(manifestPath)) return 0;
  const old = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (old.version !== 2 || !old.files || typeof old.files !== "object") {
    console.log("managed-files: legacy manifest migrated without pruning");
    return 0;
  }
  const next = sourceFiles(source);
  let removed = 0;
  for (const [rel, metadata] of Object.entries(old.files)) {
    if (next.has(rel)) continue;
    const dest = safeDestination(target, rel);
    if (!dest || !fs.existsSync(dest) || !metadata ||
        !/^[a-f0-9]{64}$/i.test(metadata.sha256 || "")) continue;
    // User modifications take precedence over removing stale packaged files.
    if (sha256(dest) !== metadata.sha256) continue;
    fs.unlinkSync(dest);
    removed += 1;
    console.log(`tombstone removed: ${rel}`);
  }
  return removed;
}

function snapshot(source, target) {
  const files = Object.create(null);
  for (const rel of sourceFiles(source)) {
    const dest = safeDestination(target, rel);
    if (!dest || !fs.existsSync(dest)) continue;
    const buf = fs.readFileSync(dest);
    files[rel] = { sha256: crypto.createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
  }
  const manifestPath = path.join(target, MANIFEST);
  const temporary = `${manifestPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 2, generator: "orquestrador-maestro 1.1.0", files }, null, 2));
    fs.renameSync(temporary, manifestPath);
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
  return Object.keys(files).length;
}

function main(argv) {
  const [mode, sourceArg, targetArg] = argv;
  if (!["prune", "snapshot"].includes(mode) || !sourceArg || !targetArg) {
    throw new Error("Usage: managed-files.js prune|snapshot <source> <target>");
  }
  const source = path.resolve(sourceArg);
  const target = path.resolve(targetArg);
  if (!fs.statSync(source).isDirectory() || !fs.statSync(target).isDirectory()) {
    throw new Error("Source and target must be existing directories");
  }
  return mode === "prune" ? prune(source, target) : snapshot(source, target);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`managed-files: ${error.message}`); process.exitCode = 1; }
}

module.exports = { sourceFiles, safeDestination, prune, snapshot, main };
