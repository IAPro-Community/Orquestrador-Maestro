"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function runGit(args, cwd, { input, encoding = "utf8" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, shell: false, windowsHide: true, stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] });
    const stdout = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout.push(chunk); });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(encoding === null ? Buffer.concat(stdout) : Buffer.concat(stdout).toString(encoding)) : reject(new Error(stderr || `git exited ${code}`)));
    if (input) child.stdin.end(input);
  });
}

function assertSafeSegment(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new TypeError(`${name} must contain only path-safe characters`);
  }
  if (value === "." || value === "..") {
    throw new TypeError(`${name} must not be a relative path segment`);
  }
}

class WorkspaceManager {
  constructor({ rootDirectory = ".maestro/worktrees", sessionRootDirectory = path.join(os.homedir(), ".orquestrador", "runtime", "worktrees") } = {}) {
    this.rootDirectory = rootDirectory;
    this.sessionRootDirectory = path.resolve(sessionRootDirectory);
  }

  async createWorktree({ repositoryPath, runId, stepId, ref = "HEAD" }) {
    assertSafeSegment(runId, "runId");
    assertSafeSegment(stepId, "stepId");
    const directory = path.isAbsolute(this.rootDirectory)
      ? path.resolve(this.rootDirectory, `${runId}-${stepId}`)
      : path.resolve(repositoryPath, this.rootDirectory, `${runId}-${stepId}`);
    const repositoryRoot = path.resolve(repositoryPath);
    const relative = path.relative(path.isAbsolute(this.rootDirectory) ? path.resolve(this.rootDirectory) : repositoryRoot, directory);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("workspace path escaped the repository root");
    }
    if (fs.existsSync(directory)) throw new Error(`workspace already exists: ${directory}`);
    fs.mkdirSync(path.dirname(directory), { recursive: true });
    await runGit(["worktree", "add", "--detach", directory, ref], repositoryPath);
    return Object.freeze({ id: `${runId}-${stepId}`, path: directory, isolated: true });
  }

  async createSessionWorktree({ repositoryPath, projectId, sessionId, ref = "HEAD", includeWorkingTree = true }) {
    assertSafeSegment(projectId, "projectId"); assertSafeSegment(sessionId, "sessionId");
    const repositoryRoot = path.resolve((await runGit(["rev-parse", "--show-toplevel"], repositoryPath)).trim());
    const directory = path.resolve(this.sessionRootDirectory, projectId, sessionId);
    const relative = path.relative(this.sessionRootDirectory, directory);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("workspace path escaped the runtime worktree root");
    if (fs.existsSync(directory)) throw new Error(`workspace already exists: ${directory}`);
    fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
    try {
      await runGit(["worktree", "add", "--detach", directory, ref], repositoryRoot);
      if (includeWorkingTree) await this.copyWorkingTreeState(repositoryRoot, directory);
      return Object.freeze({ id: sessionId, path: directory, isolated: true, repositoryPath: repositoryRoot, ref });
    } catch (error) {
      try { await runGit(["worktree", "remove", "--force", directory], repositoryRoot); } catch { /* Best-effort rollback. */ }
      throw error;
    }
  }

  async copyWorkingTreeState(repositoryRoot, worktreePath) {
    const patch = await runGit(["diff", "--binary", "HEAD"], repositoryRoot, { encoding: null });
    if (patch.length > 0) await runGit(["apply", "--binary", "--whitespace=nowarn", "-"], worktreePath, { input: patch });
    const untracked = await runGit(["ls-files", "--others", "--exclude-standard", "-z"], repositoryRoot, { encoding: null });
    for (const relativePath of untracked.toString("utf8").split("\0").filter(Boolean)) {
      const source = path.resolve(repositoryRoot, relativePath); const target = path.resolve(worktreePath, relativePath);
      if (!source.startsWith(`${repositoryRoot}${path.sep}`) || !target.startsWith(`${worktreePath}${path.sep}`)) throw new Error("untracked path escaped workspace");
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.cpSync(source, target, { recursive: true, dereference: false });
    }
  }
}

module.exports = { WorkspaceManager, assertSafeSegment, runGit };
