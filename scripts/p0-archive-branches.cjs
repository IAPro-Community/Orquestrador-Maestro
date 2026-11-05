#!/usr/bin/env node
"use strict";

// P0 archival finalization; archives must already exist at the exact source
// SHA. This tool NEVER deletes a source ref without a verified archive ref.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const manifest = JSON.parse(fs.readFileSync(path.resolve(
  __dirname, "../docs/release/p0-branch-archive.json"), "utf8"));

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd, encoding: "utf8", timeout: 30000, windowsHide: true, shell: false
  });
}
function output(cwd, args) {
  const r = git(cwd, args);
  if (r.status !== 0 || r.error) throw Error("git check failed: " + args[0]);
  return (r.stdout || "").trim();
}
function remoteSha(cwd, name) {
  const r = git(cwd, ["ls-remote", "--heads", "origin", "refs/heads/" + name]);
  if (r.status !== 0 || r.error) throw Error("Remote ref check unavailable");
  const line = (r.stdout || "").trim();
  return line ? line.split(/\s+/)[0] : null;
}
function safeEntry(e) {
  if (!e || typeof e.name !== "string") return false;
  const name = e.name;
  return (
    /^(feat|fix|docs|test)\/[a-zA-Z0-9._/-]+$/.test(name) &&
    !name.includes("..") && !name.includes("//") && !name.endsWith("/") &&
    e.archiveBranch === "archive/p0-20261105/" + name &&
    /^[a-f0-9]{40}$/.test(e.expectedHeadSha) &&
    Number.isInteger(e.pr) && e.pr > 0 &&
    (e.kind === "closed-unmerged" || e.kind === "integrated-superseded") &&
    (e.kind === "closed-unmerged" ||
      (typeof e.proofCommitSha === "string" &&
       /^[a-f0-9]{40}$/.test(e.proofCommitSha)))
  );
}
function parse(args) {
  const opts = { nexus: null, apply: false };
  for (const arg of args) {
    if (arg === "--apply") opts.apply = true;
    else if (arg.startsWith("--nexus=")) opts.nexus = path.resolve(arg.slice(8));
    else throw Error("Unknown argument " + arg);
  }
  if (!opts.nexus) throw Error("--nexus=<checkout> is required");
  return opts;
}
function checkout(cwd, project) {
  if (output(cwd, ["branch", "--show-current"]) !== project.releaseBranch) {
    throw Error("Wrong active release branch");
  }
  if (output(cwd, ["status", "--porcelain", "--untracked-files=normal"])) {
    throw Error("Dirty release checkout");
  }
  const origin = output(cwd, ["remote", "get-url", "origin"]);
  if (!/github\.com[/:]/.test(origin) ||
      !origin.replace(/\.git$/, "").endsWith(project.repository)) {
    throw Error("Unexpected origin remote");
  }
}
function proofPresent(cwd, e) {
  if (e.kind === "closed-unmerged") return true;
  const result = git(cwd, ["merge-base", "--is-ancestor", e.proofCommitSha, "HEAD"]);
  return result.status === 0 && !result.error;
}
function inspect(cwd, project) {
  checkout(cwd, project);
  const names = new Set();
  return project.branches.map(e => {
    if (!safeEntry(e) || names.has(e.name)) throw Error("Unsafe/duplicate archival entry");
    names.add(e.name);
    const archiveSha = remoteSha(cwd, e.archiveBranch);
    const originalSha = remoteSha(cwd, e.name);
    let status;
    if (archiveSha !== e.expectedHeadSha) status = "BLOCKED_ARCHIVE_MISSING_OR_CHANGED";
    else if (e.kind === "integrated-superseded" && !proofPresent(cwd, e)) {
      status = "BLOCKED_INTEGRATION_PROOF_MISSING";
    } else if (originalSha && originalSha !== e.expectedHeadSha) {
      status = "BLOCKED_ORIGINAL_CHANGED";
    } else if (!originalSha) status = "ARCHIVED";
    else status = "READY_TO_RENAME";
    return { ...e, status };
  });
}
function main() {
  const opts = parse(process.argv.slice(2));
  if (manifest.schemaVersion !== 2) throw Error("Unsupported archive manifest");
  const roots = [
    [path.resolve(__dirname, ".."), manifest.projects.maestro],
    [opts.nexus, manifest.projects.nexus]
  ];
  // Both repositories are inspected before any ref is removed.
  const plans = roots.map(([cwd, project]) => ({
    cwd, project, items: inspect(cwd, project)
  }));
  let archived = 0, renamed = 0, blocked = 0, ready = 0;
  for (const plan of plans) {
    console.log(plan.project.repository + " -> " + plan.project.releaseBranch);
    for (const item of plan.items) {
      if (item.status === "ARCHIVED") {
        archived++;
      } else if (item.status !== "READY_TO_RENAME") {
        blocked++;
      } else {
        ready++;
        if (opts.apply) {
          // Close the read/delete TOCTOU window by using a remote SHA lease.
          // Abort if a contributor pushed to the original ref.
          if (remoteSha(plan.cwd, item.archiveBranch) !== item.expectedHeadSha) {
            blocked++;
            console.log("  BLOCKED_ARCHIVE_MOVED #" + item.pr + " " + item.name);
            continue;
          }
          const lease = "--force-with-lease=refs/heads/" + item.name +
            ":" + item.expectedHeadSha;
          const r = git(plan.cwd, [
            "push", lease, "origin", ":refs/heads/" + item.name
          ]);
          if (r.status === 0 && !r.error) {
            renamed++;
            console.log("  ARCHIVED #" + item.pr + " " + item.archiveBranch);
            continue;
          }
          blocked++;
          console.log("  BLOCKED_REMOTE_UPDATE #" + item.pr + " " + item.name);
          continue;
        }
      }
      console.log("  " + item.status + " #" + item.pr + " " +
        item.name + " -> " + item.archiveBranch);
    }
  }
  console.log(JSON.stringify({ archivesVerified: archived, ready, renamed, blocked }));
  if (!opts.apply) console.log("Preview only; --apply finalizes verified rename.");
  if (blocked) process.exitCode = 1;
}
module.exports = { safeEntry, parse };
if (require.main === module) {
  try { main(); }
  catch (err) {
    console.error("Archival blocked: " + String(err?.message || err).slice(0, 300));
    process.exitCode = 1;
  }
}
