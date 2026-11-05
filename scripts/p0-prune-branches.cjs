#!/usr/bin/env node
"use strict";

// Ref deletion is intentional and opt-in. Exact SHA + release ancestry,
// and a fixed reviewed whitelist are mandatory. No arbitrary branch input.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const manifest = JSON.parse(fs.readFileSync(path.resolve(
  __dirname, "../docs/release/p0-branch-prune.json"), "utf8"));

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd, encoding: "utf8", timeout: 30000, windowsHide: true, shell: false
  });
}
function output(cwd, args) {
  const r = git(cwd, args);
  if (r.status !== 0 || r.error) throw Error("git command failed: " + args[0]);
  return (r.stdout || "").trim();
}
function assertCheckout(cwd, project) {
  if (output(cwd, ["branch", "--show-current"]) !== project.releaseBranch) {
    throw Error("Checkout must be on " + project.releaseBranch);
  }
  if (output(cwd, ["status", "--porcelain", "--untracked-files=normal"])) {
    throw Error("Worktree is dirty for " + project.repository);
  }
  const url = output(cwd, ["remote", "get-url", "origin"]);
  if (!url.includes("github.com") ||
      !url.replace(/\.git$/, "").endsWith(project.repository)) {
    throw Error("Unexpected origin repository for " + project.repository);
  }
}
function remoteHead(cwd, branch) {
  const r = git(cwd, ["ls-remote", "--heads", "origin", "refs/heads/" + branch]);
  if (r.status !== 0 || r.error) throw Error("Cannot inspect remote ref " + branch);
  return (r.stdout || "").trim().split(/\s+/)[0] || null;
}
function releaseContains(cwd, sha) {
  const r = git(cwd, ["merge-base", "--is-ancestor", sha, "HEAD"]);
  return r.status === 0 && !r.error;
}
function parse(argv) {
  const options = { apply: false, nexus: null };
  for (const value of argv) {
    if (value === "--apply") options.apply = true;
    else if (value.startsWith("--nexus=")) options.nexus = path.resolve(value.slice(8));
    else throw Error("Unsupported option: " + value);
  }
  if (!options.nexus) throw Error("Specify --nexus=<local Nexus checkout>");
  return options;
}

function inspectProject(cwd, project) {
  assertCheckout(cwd, project);
  const results = [];
  for (const entry of project.branches) {
    const name = entry.name;
    if (!/^(feat|fix|docs|test)\/[A-Za-z0-9._/-]+$/.test(name) ||
        name.startsWith("release/") ||
        !/^[a-f0-9]{40}$/.test(entry.expectedHeadSha) ||
        !/^[a-f0-9]{40}$/.test(entry.proofCommitSha)) {
      throw Error("Unsafe cleanup manifest entry");
    }
    const actual = remoteHead(cwd, name);
    if (!actual) {
      results.push({ name, status: "ALREADY_ABSENT", pr: entry.pr });
      continue;
    }
    if (actual !== entry.expectedHeadSha) {
      results.push({ name, status: "BLOCKED_REMOTE_SHA_CHANGED", pr: entry.pr });
      continue;
    }
    if (!releaseContains(cwd, entry.proofCommitSha)) {
      results.push({ name, status: "BLOCKED_PROOF_NOT_IN_RELEASE", pr: entry.pr });
      continue;
    }
    results.push({ name, status: "SAFE", expectedHeadSha: actual, pr: entry.pr });
  }
  return results;
}

function main() {
  const opts = parse(process.argv.slice(2));
  if (manifest.schemaVersion !== 1) throw Error("Unsupported cleanup manifest");
  const roots = [
    [path.resolve(__dirname, ".."), manifest.projects.maestro],
    [opts.nexus, manifest.projects.nexus]
  ];
  // Preflight *both* repositories before touching either one.
  const plans = roots.map(([cwd, project]) => ({
    cwd, project, refs: inspectProject(cwd, project)
  }));
  let safe = 0;
  let deleted = 0;
  let blocked = 0;
  for (const plan of plans) {
    console.log(plan.project.repository + " → " + plan.project.releaseBranch);
    for (const entry of plan.refs) {
      if (entry.status !== "SAFE") {
        if (entry.status !== "ALREADY_ABSENT") blocked++;
        console.log("  " + entry.status + " #" + entry.pr + " " + entry.name);
        continue;
      }
      safe++;
      if (!opts.apply) {
        console.log("  SAFE (dry-run) #" + entry.pr + " " + entry.name);
        continue;
      }
      // --force-with-lease protects against remote ref changes after
      // ls-remote: the deletion is refused if anyone pushed meanwhile.
      const guard = "--force-with-lease=refs/heads/" + entry.name +
        ":" + entry.expectedHeadSha;
      const result = git(plan.cwd, [
        "push", guard, "origin", ":refs/heads/" + entry.name
      ]);
      if (result.status === 0 && !result.error) {
        deleted++;
        console.log("  REMOVED #" + entry.pr + " " + entry.name);
      } else {
        blocked++;
        console.log("  BLOCKED_REMOTE_DELETE #" + entry.pr + " " + entry.name);
      }
    }
  }
  console.log("safe=" + safe + " deleted=" + deleted + " blocked=" + blocked);
  if (!opts.apply) console.log("Preview only. Add --apply to delete only SAFE refs.");
  if (blocked) process.exitCode = 1;
}

try { main(); }
catch (error) {
  console.error("Cleanup stopped: " + String(error.message || error).slice(0, 350));
  process.exitCode = 1;
}
