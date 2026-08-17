"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { execFileSync } = require("node:child_process");
const { WorkspaceManager } = require("../manager");

test("WorkspaceManager rejects unsafe identifiers before invoking git", async () => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-workspace-"));
  const manager = new WorkspaceManager();

  await assert.rejects(
    manager.createWorktree({ repositoryPath, runId: "../escape", stepId: "step-1" }),
    /path-safe/u
  );
});

test("WorkspaceManager creates an isolated agent worktree including current local changes", async () => {
  const repositoryPath = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-worktree-source-"));
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-worktree-runtime-"));
  const git = (args) => execFileSync("git", args, { cwd: repositoryPath, encoding: "utf8" });
  git(["init", "-q"]); git(["config", "user.email", "maestro@example.test"]); git(["config", "user.name", "Maestro Test"]);
  fs.writeFileSync(path.join(repositoryPath, "tracked.txt"), "base\n", "utf8");
  git(["add", "tracked.txt"]); git(["commit", "-qm", "base"]);
  fs.writeFileSync(path.join(repositoryPath, "tracked.txt"), "alteração local\n", "utf8");
  fs.writeFileSync(path.join(repositoryPath, "novo.txt"), "não rastreado\n", "utf8");
  const manager = new WorkspaceManager({ sessionRootDirectory: runtimeRoot });

  const workspace = await manager.createSessionWorktree({ repositoryPath, projectId: "project-1", sessionId: "session-1" });

  assert.equal(fs.readFileSync(path.join(workspace.path, "tracked.txt"), "utf8"), "alteração local\n");
  assert.equal(fs.readFileSync(path.join(workspace.path, "novo.txt"), "utf8"), "não rastreado\n");
  assert.equal(workspace.path.startsWith(runtimeRoot), true);
});
