"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Discovery is advisory and intentionally bounded. Never execute project code,
// traverse symlinks, claim the candidates are compatible, or persist a second index.
const ROOTS = Object.freeze(["src", "app", "apps", "packages", "frontend", "web"]);
const IGNORED = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "build", "coverage",
  ".cache", ".turbo", "target", ".venv", "__pycache__", "vendor", ".output"
]);
const SOURCE_EXT = /\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|java|kt|py)$/i;
const TEST_FILE = /(?:^|\/)(?:__tests__|__mocks__|test|tests|fixtures)(?:\/|$)|(?:\.test|\.spec|\.stories)\.[^.]+$/i;
const EXPORTED = /\bexport\s+(?:default\s+)?(?:function|class|const|let|type|interface|enum|async\s+function|\{)|\bmodule\.exports\b|\bexports\.[a-zA-Z_$]|\bpublic\s+(?:class|interface|enum)\b/;
const MAX_ENTRIES = 768;
const MAX_SOURCE_FILES = 128;
const MAX_BYTES_PER_FILE = 65536;
const MAX_CANDIDATES = 12;

function roleFor(relative) {
  const name = relative.toLowerCase();
  if (/(?:^|\/)(?:components|facades|forms|widgets|ui)(?:\/|$)/.test(name) ||
      /(?:grid|table|form|dialog|modal|input|button|select|facade)\.(?:tsx?|jsx?|vue|svelte)$/.test(name)) {
    return "ui-candidate";
  }
  if (/(?:^|\/)(?:api|clients|services)(?:\/|$)/.test(name) ||
      /(?:api|client|service)\.(?:tsx?|jsx?|java|kt|py)$/.test(name)) {
    return "service-candidate";
  }
  if (/(?:^|\/)(?:auth|security)(?:\/|$)/.test(name)) return "auth-candidate";
  return null;
}

function discoverReuseCandidates(workspacePath, intent = "") {
  if (typeof workspacePath !== "string" || !workspacePath.trim()) {
    throw new TypeError("workspacePath required");
  }
  const root = path.resolve(workspacePath);
  const queue = [];
  for (const name of ROOTS) {
    const directory = path.join(root, name);
    try {
      if (fs.lstatSync(directory).isDirectory()) queue.push({ directory, depth: 0 });
    } catch { /* No matching source directory. */ }
  }
  const intentTerms = [...new Set(String(intent).toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4))].slice(0, 16);
  const candidates = [];
  let scannedEntries = 0;
  let scannedFiles = 0;
  let truncated = false;
  while (queue.length && scannedEntries < MAX_ENTRIES && scannedFiles < MAX_SOURCE_FILES) {
    const current = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name, "en"));
    } catch { continue; }
    for (const entry of entries) {
      if (++scannedEntries > MAX_ENTRIES) { truncated = true; break; }
      if (entry.isSymbolicLink() || IGNORED.has(entry.name)) continue;
      const absolute = path.join(current.directory, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < 8) queue.push({ directory: absolute, depth: current.depth + 1 });
        else truncated = true;
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXT.test(entry.name)) continue;
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (TEST_FILE.test(relative)) continue;
      const role = roleFor(relative);
      if (!role) continue;
      if (++scannedFiles > MAX_SOURCE_FILES) { truncated = true; break; }
      try {
        const info = fs.lstatSync(absolute);
        if (!info.isFile() || info.size > MAX_BYTES_PER_FILE) continue;
        const bytes = fs.readFileSync(absolute);
        // Filename-only matches can be non-public implementation details.
        // An export is evidence of a symbol, NOT proof of reusable behavior.
        if (!EXPORTED.test(bytes.toString("utf8"))) continue;
        const sourceDigest = crypto.createHash("sha256").update(bytes).digest("hex");
        const score = intentTerms.filter((word) => relative.toLowerCase().includes(word)).length;
        candidates.push({ path: relative, role, sourceDigest, evidence: "export-and-path", score });
      } catch { /* Unreadable source is not evidence. */ }
    }
  }
  if (queue.length || scannedEntries >= MAX_ENTRIES || scannedFiles >= MAX_SOURCE_FILES) truncated = true;
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, "en"));
  if (candidates.length > MAX_CANDIDATES) truncated = true;
  const visible = candidates.slice(0, MAX_CANDIDATES).map(({ score, ...entry }) => Object.freeze(entry));
  return Object.freeze({
    schemaVersion: 1,
    status: "CANDIDATES_NOT_VERIFIED",
    scannedEntries, scannedFiles, truncated,
    candidates: Object.freeze(visible)
  });
}

module.exports = { discoverReuseCandidates };
