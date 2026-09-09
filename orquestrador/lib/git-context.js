#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

function gitExec(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 5000
    }).trim();
  } catch {
    return null;
  }
}

function normalizeRemote(raw) {
  if (!raw) return null;
  let url = raw.replace(/\.git$/, "");

  const sshMatch = url.match(/^git@([^:]+):(\d+)\/(.+)$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const port = sshMatch[2];
    const repoPath = sshMatch[3];
    if (port === "22") {
      return `https://${host}/${repoPath}`.toLowerCase();
    }
    return `https://${host}:${port}/${repoPath}`.toLowerCase();
  }

  const sshSimple = url.match(/^git@([^:]+):(.+)$/);
  if (sshSimple) {
    const host = sshSimple[1];
    const repoPath = sshSimple[2];
    return `https://${host}/${repoPath}`.toLowerCase();
  }

  const sshProto = url.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (sshProto) {
    const hostPort = sshProto[1];
    const repoPath = sshProto[2];
    const parts = hostPort.split(":");
    const host = parts[0];
    const port = parts[1] || "22";
    if (port === "22") {
      return `https://${host}/${repoPath}`.toLowerCase();
    }
    return `https://${host}:${port}/${repoPath}`.toLowerCase();
  }

  url = url
    .replace(/^git:\/\/([^/]+)\//, "https://$1/")
    .replace(/^https?:\/\//, "https://")
    .toLowerCase();

  return url;
}

function resolveProjectRoot(startPath) {
  const resolved = path.resolve(startPath);
  const toplevel = gitExec(["rev-parse", "--show-toplevel"], resolved);
  if (!toplevel) return null;
  try {
    return fs.realpathSync(toplevel);
  } catch {
    return toplevel;
  }
}

function resolveRepositoryId(projectRoot) {
  const raw = gitExec(["remote", "get-url", "origin"], projectRoot);
  const normalized = normalizeRemote(raw);
  if (normalized) {
    return `repo_${crypto.createHash("sha256").update(normalized).digest("hex").substring(0, 16)}`;
  }
  const commonDir = gitExec(["rev-parse", "--git-common-dir"], projectRoot);
  if (commonDir) {
    const resolvedCommon = path.resolve(projectRoot, commonDir);
    const canonicalReal = (() => {
      try { return fs.realpathSync(resolvedCommon); } catch { return resolvedCommon; }
    })();
    return `repo_${crypto.createHash("sha256").update(canonicalReal).digest("hex").substring(0, 16)}`;
  }
  const fallback = projectRoot.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 64);
  return `repo_${crypto.createHash("sha256").update(fallback).digest("hex").substring(0, 16)}`;
}

function resolveBranch(projectRoot) {
  const branch = gitExec(["branch", "--show-current"], projectRoot);
  if (branch) return branch;
  const head = gitExec(["rev-parse", "HEAD"], projectRoot);
  if (head) return null;
  return "unknown";
}

function resolveHeadCommit(projectRoot) {
  return gitExec(["rev-parse", "HEAD"], projectRoot) || "unknown";
}

function resolveWorkspaceId(projectRoot) {
  const gitDir = path.join(projectRoot, ".git");
  try {
    const stat = fs.lstatSync(gitDir);
    if (stat.isFile()) {
      const content = fs.readFileSync(gitDir, "utf8");
      const match = content.match(/gitdir:\s*(.+)/);
      if (match) {
        return `ws_${crypto.createHash("sha256").update(match[1].trim()).digest("hex").substring(0, 16)}`;
      }
    }
  } catch {}
  return `ws_${crypto.createHash("sha256").update(projectRoot).digest("hex").substring(0, 16)}`;
}

function resolveDetached(projectRoot) {
  const branch = gitExec(["branch", "--show-current"], projectRoot);
  return !branch || branch === "HEAD";
}

function resolveRemote(projectRoot) {
  return gitExec(["remote", "get-url", "origin"], projectRoot) || null;
}

function isAncestor(projectRoot, ancestorCommit, descendantCommit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestorCommit, descendantCommit], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 5000
    });
    return true;
  } catch {
    return false;
  }
}

function resolveGitContext(projectPath) {
  const projectRoot = resolveProjectRoot(projectPath);
  if (!projectRoot) {
    return {
      projectRoot: path.resolve(projectPath),
      repositoryId: `repo_${crypto.createHash("sha256").update(path.resolve(projectPath)).digest("hex").substring(0, 16)}`,
      workspaceId: `ws_${crypto.createHash("sha256").update(path.resolve(projectPath)).digest("hex").substring(0, 16)}`,
      branch: "unknown",
      detached: false,
      headCommit: "unknown",
      remote: null,
      vcs: null,
      gitDir: null,
      commonGitDir: null
    };
  }

  const detached = resolveDetached(projectRoot);
  const branch = resolveBranch(projectRoot);
  const gitDir = gitExec(["rev-parse", "--git-dir"], projectRoot);
  const commonGitDir = gitExec(["rev-parse", "--git-common-dir"], projectRoot);

  return {
    projectRoot,
    repositoryId: resolveRepositoryId(projectRoot),
    workspaceId: resolveWorkspaceId(projectRoot),
    branch: detached ? null : branch,
    detached,
    headCommit: resolveHeadCommit(projectRoot),
    remote: resolveRemote(projectRoot),
    vcs: "git",
    gitDir: gitDir ? path.resolve(projectRoot, gitDir) : null,
    commonGitDir: commonGitDir ? path.resolve(projectRoot, commonGitDir) : null
  };
}

function shouldUseMemory(taskClassification) {
  if (!taskClassification || !taskClassification.class) return false;
  switch (taskClassification.class) {
    case "trivial": return false;
    case "bounded": return false;
    case "complex": return true;
    case "investigation": return true;
    case "resumed": return true;
    default: return false;
  }
}

module.exports = {
  resolveGitContext,
  resolveProjectRoot,
  resolveRepositoryId,
  resolveBranch,
  resolveHeadCommit,
  resolveWorkspaceId,
  resolveDetached,
  resolveRemote,
  isAncestor,
  normalizeRemote,
  shouldUseMemory,
  gitExec
};
