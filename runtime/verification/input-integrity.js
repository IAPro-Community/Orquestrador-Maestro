"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");
// Bounded drift guard, not a sandbox or a transitive dependency resolver.
const VERIFIER_CONFIG_FILES = Object.freeze([
  "package.json", ".npmrc", "Makefile", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml",
  "yarn.lock", "bun.lock", "bun.lockb",
  "vitest.config.js", "vitest.config.ts", "vitest.config.mjs",
  "jest.config.js", "jest.config.ts", "jest.config.cjs", "jest.config.mjs",
  "playwright.config.ts", "playwright.config.js",
  "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs",
  "tsconfig.json", "pytest.ini", "pyproject.toml", "tox.ini",
  "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle",
  "settings.gradle.kts", "go.mod", "go.sum", "Cargo.toml", "Cargo.lock"
]);
const MAX_VERIFIER_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const ROOTS = ["test", "tests", "__tests__", "spec", "specs", "e2e", "scripts", "tools"];
const EXCLUDED = new Set([".git","node_modules","dist","build","coverage","__pycache__"]);
const FILE = /\.(?:[cm]?js|[cm]?ts|jsx|tsx|sh|ps1|py|java|kt|go|rs|json|ya?ml|toml|xml|feature|snap|sql)$/i;
const TEST = /(?:^|\/)(?:__tests__|tests?|e2e|specs?)(?:\/|$)|(?:\.test|\.spec|_test|Test|Tests)\.[^/]+$/i;
function collectInputs(workspacePath, paths) {
  let count = 0;
  const visit = relative => {
    const info = verifierInputStat(workspacePath, relative);
    if (!info.isDirectory()) throw Error("Unsafe verifier directory");
    const dir = fs.opendirSync(path.join(workspacePath, relative));
    try {
      for (let entry; (entry = dir.readSync());) {
        if (++count > MAX_ENTRIES) throw Error("Verifier scan bound exceeded");
        if (entry.name.startsWith(".") || EXCLUDED.has(entry.name)) continue;
        const child = relative + "/" + entry.name;
        if (entry.isSymbolicLink()) throw Error("Unsafe verifier path");
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile() && FILE.test(entry.name)) paths.add(child);
      }
    } finally { dir.closeSync(); }
  };
  for (const root of ROOTS) {
    try { visit(root); } catch (err) { if (err.code !== "ENOENT") throw err; }
  }
  // Also protect tracked colocated tests, including files deleted by the agent.
  const listed = spawnSync("git", ["ls-files", "-z"], {cwd:workspacePath, encoding:"utf8", timeout:5000, maxBuffer:4*1024*1024});
  if (listed.error || listed.status !== 0) throw Error("Verifier tracked inventory unavailable");
  for (const relative of listed.stdout.split("\0")) {
    if (relative && TEST.test(relative) && FILE.test(relative)) paths.add(relative);
    if (paths.size > MAX_ENTRIES) throw Error("Verifier input bound exceeded");
  }
}


// Check every path segment inside the workspace; lstat on the leaf alone
// follows symbolic parent directories. This is a drift guard, not a sandbox.
function verifierInputStat(workspacePath, relative) {
  let current = workspacePath;
  const parts = relative.split("/");
  if (parts.length > 64 || parts.some(part => !part || part === "." || part === ".." || part.includes("\\") || part.includes(":"))) throw Error("Unsafe verifier input path");
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())) {
      throw new Error("Unsafe verifier input path");
    }
    if (index === parts.length - 1) return info;
  }
}

function sameFile(a, b) {
  return a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino &&
    a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function readBounded(workspacePath, relative, cap) {
  const before = verifierInputStat(workspacePath, relative);
  if (!before.isFile() || before.size > cap) throw Error("Unsafe or oversized verifier input");
  const file = path.join(workspacePath, relative);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!sameFile(before, opened)) throw Error("Verifier file changed before read");
    const bytes = Buffer.alloc(opened.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) break;
      offset += count;
    }
    if (offset !== opened.size || !sameFile(opened, fs.fstatSync(fd)) ||
        !sameFile(opened, verifierInputStat(workspacePath, relative))) throw Error("Verifier file changed during read");
    return bytes.subarray(0, offset);
  } finally { fs.closeSync(fd); }
}
function verifierConfigSnapshot(workspacePath) {
  const paths = new Set(VERIFIER_CONFIG_FILES);
  let unsafe = false;
  try {
    const info = verifierInputStat(workspacePath, "package.json");
    if (!info.isFile() || info.size > MAX_VERIFIER_INPUT_BYTES) {
      unsafe = true;
    } else {
      const pkg = JSON.parse(readBounded(workspacePath, "package.json", MAX_VERIFIER_INPUT_BYTES).toString("utf8"));
      for (const script of Object.values(pkg?.scripts || {})) {
        if (typeof script !== "string") continue;
        // Only local paths inside fixed script directories. This is deliberately
        // not a shell parser; ambiguous/unrecognized indirection must not be
        // advertised as fully protected by this guard.
        const matcher = /\b((?:scripts|tools|test|tests)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:[cm]?js|ts|sh|py))\b/g;
        for (const hit of script.matchAll(matcher)) {
          paths.add(hit[1]);
          if (paths.size > MAX_ENTRIES) throw Error("Verifier input bound exceeded");
        }
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") unsafe = true;
  }
  try { collectInputs(workspacePath, paths); } catch { unsafe = true; }
  let totalBytes = 0;
  const snapshot = [];
  for (const relative of [...paths].sort()) {
    try {
      const info = verifierInputStat(workspacePath, relative);
      totalBytes += info.size;
      if (!info.isFile() || info.size > MAX_VERIFIER_INPUT_BYTES || totalBytes > MAX_TOTAL_BYTES || paths.size > MAX_ENTRIES) {
        unsafe = true;
        snapshot.push([relative, "UNSAFE"]);
      } else {
        snapshot.push([relative,
          crypto.createHash("sha256").update(readBounded(workspacePath, relative, info.size)).digest("hex")]);
      }
    } catch (error) {
      if (error?.code === "ENOENT") snapshot.push([relative, "ABSENT"]);
      else {
        unsafe = true;
        snapshot.push([relative, "UNREADABLE"]);
      }
    }
  }
  const identity = resolveGitContext(workspacePath);
  if (identity.vcs !== "git" || !identity.repositoryId || !identity.workspaceId || !/^[0-9a-f]{40,64}$/.test(identity.headCommit || "")) unsafe = true;
  const binding = { repositoryId:identity.repositoryId, workspaceId:identity.workspaceId, headCommit:identity.headCommit, branch:identity.branch };
  const digest = crypto.createHash("sha256").update(JSON.stringify([binding,snapshot])).digest("hex");
  return Object.freeze({ digest, unsafe, binding:Object.freeze(binding), inputCount:snapshot.length });
}

module.exports = { verifierConfigSnapshot };
