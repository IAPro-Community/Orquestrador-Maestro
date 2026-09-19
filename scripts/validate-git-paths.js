#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const WIN_RESERVED_PATTERN = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
const WIN_INVALID_CHARS = /[<>:"|?*\x00-\x1F\x7F]/;

/**
 * Validate an array of path strings against cross-platform Windows compatibility rules.
 * @param {string[]} paths - Array of relative path strings.
 * @returns {Array<{ path: string, reason: string }>} List of violations.
 */
function validatePaths(paths) {
  const violations = [];

  for (const p of paths) {
    if (!p) continue;

    // Check for control characters and invalid Windows characters
    if (WIN_INVALID_CHARS.test(p)) {
      violations.push({
        path: p,
        reason: "Contains control characters (\\n, \\r, NUL) or invalid Windows characters (< > : \" | ? *)"
      });
      continue;
    }

    // Check directory segments
    const segments = p.split("/");
    for (const seg of segments) {
      if (!seg) continue;

      if (WIN_RESERVED_PATTERN.test(seg)) {
        violations.push({
          path: p,
          reason: `Segment '${seg}' is a Windows reserved device name (CON, PRN, AUX, NUL, COM1-9, LPT1-9)`
        });
        break;
      }

      if (seg.endsWith(".") || seg.endsWith(" ")) {
        violations.push({
          path: p,
          reason: `Segment '${seg}' ends with a trailing dot or space (invalid on Windows)`
        });
        break;
      }
    }
  }

  return violations;
}

/**
 * Get paths from git tree or index in NUL-safe format.
 * @param {string} rootDir - Root directory of git repo.
 * @param {string} [ref] - Optional git ref/commit/tree (e.g. "HEAD"). If omitted, checks staged/working tree.
 * @returns {string[]}
 */
function getGitPaths(rootDir, ref) {
  let args;
  if (ref) {
    args = ["ls-tree", "-rz", "--name-only", ref];
  } else {
    // Check staged index / tracked files via NUL-safe output
    args = ["ls-files", "-z"];
  }

  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.error?.message}`);
  }

  return result.stdout.split("\0").filter(Boolean);
}

function runCli() {
  const rootDir = path.resolve(__dirname, "..");
  const args = process.argv.slice(2);
  let ref = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ref" && args[i + 1]) {
      ref = args[i + 1];
      i++;
    } else if (args[i].startsWith("--ref=")) {
      ref = args[i].split("=")[1];
    }
  }

  try {
    const paths = getGitPaths(rootDir, ref);
    const violations = validatePaths(paths);

    if (violations.length > 0) {
      console.error(`✗ Git path validation failed: found ${violations.length} Windows-incompatible path(s):`);
      for (const v of violations.slice(0, 50)) {
        console.error(`  - ${JSON.stringify(v.path)}: ${v.reason}`);
      }
      if (violations.length > 50) {
        console.error(`  ... and ${violations.length - 50} more.`);
      }
      process.exit(1);
    } else {
      console.log(`✓ All ${paths.length} git paths are valid and Windows-compatible.`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`✗ Error running git path validation: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = { validatePaths, getGitPaths, WIN_RESERVED_PATTERN, WIN_INVALID_CHARS };
