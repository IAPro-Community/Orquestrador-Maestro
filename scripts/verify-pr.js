#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
let exitCode = 0;

function runCheck(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    exitCode = 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("verify:pr — running checks...\n");

console.log("1. npm test");
const testResult = spawnSync("node", ["--test", "tests/*.test.js"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (testResult.status !== 0) {
  console.error("  ✗ npm test failed");
  exitCode = 1;
} else {
  console.log("  ✓ npm test passed");
}

console.log("\n2. npm pack --dry-run");
const packResult = spawnSync("npm", ["pack", "--dry-run"], {
  cwd: rootDir,
  stdio: "pipe",
  shell: process.platform === "win32"
});
if (packResult.status !== 0) {
  console.error("  ✗ npm pack --dry-run failed");
  exitCode = 1;
} else {
  console.log("  ✓ npm pack --dry-run passed");
}

console.log("\n3. JSON validity in orquestrador/");
runCheck("All JSON files in orquestrador/ are valid", () => {
  const jsonDir = path.join(rootDir, "orquestrador");
  if (!fs.existsSync(jsonDir)) return;
  const entries = fs.readdirSync(jsonDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      const filePath = path.join(jsonDir, entry.name);
      const content = fs.readFileSync(filePath, "utf8");
      try { JSON.parse(content); } catch (e) {
        throw new Error(`Invalid JSON: ${entry.name} — ${e.message}`);
      }
    }
  }
});

console.log("\n4. No secrets in tracked files");
runCheck("No obvious secrets in source files", () => {
  const secretPatterns = [
    /ghp_[A-Za-z0-9_]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /sk-proj-[A-Za-z0-9_-]{48,}/,
    /sk-[A-Za-z0-9]{32,}/,
    /AKIA[0-9A-Z]{16}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/
  ];
  const scanDirs = ["bin", "orquestrador", "scripts", "runtime"];
  for (const dir of scanDirs) {
    const dirPath = path.join(rootDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!["node_modules", ".git", "logs", "backups"].includes(entry.name)) {
            walk(full);
          }
        } else if (entry.isFile() && /\.(js|ts|json|sh|ps1|md)$/.test(entry.name)) {
          const content = fs.readFileSync(full, "utf8");
          for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
              const rel = path.relative(rootDir, full);
              throw new Error(`Possible secret in ${rel}`);
            }
          }
        }
      }
    };
    walk(dirPath);
  }
});

console.log("\n5. No concrete user paths in source");
runCheck("No concrete Windows/Unix home paths in tracked source", () => {
  const scanDirs = ["bin", "orquestrador", "scripts", "runtime"];
  for (const dir of scanDirs) {
    const dirPath = path.join(rootDir, dir);
    if (!fs.existsSync(dirPath)) continue;
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!["node_modules", ".git", "logs", "backups"].includes(entry.name)) {
            walk(full);
          }
        } else if (entry.isFile() && /\.(js|ts|json|sh|ps1|md)$/.test(entry.name)) {
          const content = fs.readFileSync(full, "utf8");
          if (/C:\\Users\\[A-Za-z0-9._-]+/.test(content) || /C\/Users\/[A-Za-z0-9._-]+/.test(content)) {
            const rel = path.relative(rootDir, full);
            throw new Error(`Concrete user path in ${rel}`);
          }
        }
      }
    };
    walk(dirPath);
  }
});

console.log("\n6. tool-registry completeness");
runCheck("All registry tools have required fields", () => {
  const { TOOL_DEFINITIONS, listSupportedTools } = require(path.join(rootDir, "orquestrador", "lib", "tool-registry.js"));
  const tools = listSupportedTools();
  assert(tools.length > 0, "No tools in registry");
  for (const toolId of tools) {
    const def = TOOL_DEFINITIONS[toolId];
    assert(def, `Missing definition for ${toolId}`);
    assert(def.displayName, `${toolId} missing displayName`);
    assert(Array.isArray(def.configPaths), `${toolId} configPaths not array`);
    assert(Array.isArray(def.skillTargets), `${toolId} skillTargets not array`);
  }
});

console.log("\n7. install-state integrity");
runCheck("install-state module exports", () => {
  const state = require(path.join(rootDir, "orquestrador", "lib", "install-state.js"));
  assert(typeof state.readState === "function", "readState not a function");
  assert(typeof state.writeState === "function", "writeState not a function");
  assert(typeof state.isTargetEnabled === "function", "isTargetEnabled not a function");
  const defaultState = state.getDefaultState();
  assert(defaultState.schemaVersion === 1, "wrong schemaVersion");
  assert(typeof defaultState.targets === "object", "targets not object");
  assert(state.isTargetEnabled(defaultState, "codex") === false, "isTargetEnabled should return false for missing target");
  assert(typeof state.isTargetEnabled(defaultState, "codex") === "boolean", "isTargetEnabled must return boolean");
});

console.log("\n8. No private roots tracked");
runCheck("No .omx, .local, or DEV in git tracked files", () => {
  const result = spawnSync("git", ["ls-files", ".omx", ".local", "DEV"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: false
  });
  const tracked = result.stdout.trim();
  if (tracked) {
    throw new Error(`Private roots tracked: ${tracked}`);
  }
});

console.log("\n9. Release ancestry");
runCheck("HEAD is descendant of origin/main", () => {
  const mergeBase = spawnSync("git", ["merge-base", "--is-ancestor", "origin/main", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: false
  });
  if (mergeBase.status !== 0) {
    throw new Error("HEAD is not a descendant of origin/main — rebase first");
  }
});

console.log(`\n${"=".repeat(40)}`);
if (exitCode === 0) {
  console.log("verify:pr: ALL CHECKS PASSED");
} else {
  console.log("verify:pr: SOME CHECKS FAILED");
}
process.exit(exitCode);
