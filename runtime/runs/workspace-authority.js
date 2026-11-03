"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { resolveGitContext } = require("../../orquestrador/lib/git-context");
const { normalizeAdmission, bad } = require("./submission-admission");

function realDirectory(input, name) {
  if (typeof input !== "string" || !input.trim() || input.length > 4096 || input.includes("\0")) {
    throw bad(name + " must be a bounded existing directory", "INVALID_WORKSPACE_AUTHORITY");
  }
  let real;
  try {
    real = fs.realpathSync(path.resolve(input));
    if (!fs.statSync(real).isDirectory()) throw new Error("not directory");
  } catch {
    throw bad(name + " must exist and be readable", "INVALID_WORKSPACE_AUTHORITY");
  }
  return real;
}

function bindingFromRealGitWorktree({ projectRoot, workspacePath }) {
  const root = realDirectory(projectRoot, "projectRoot");
  const workspace = realDirectory(workspacePath, "workspacePath");
  const canonical = resolveGitContext(root);
  const target = resolveGitContext(workspace);
  if (canonical.vcs !== "git" || target.vcs !== "git" ||
      canonical.projectRoot !== root || target.projectRoot !== workspace ||
      !canonical.repositoryId || !canonical.commonGitDir || !target.commonGitDir ||
      canonical.repositoryId !== target.repositoryId) {
    throw bad("Workspace must be a Git worktree root of the selected Maestro project", "INVALID_WORKSPACE_AUTHORITY");
  }
  let common, targetCommon;
  try {
    common = fs.realpathSync(canonical.commonGitDir);
    targetCommon = fs.realpathSync(target.commonGitDir);
  } catch {
    throw bad("Git common directory is invalid", "INVALID_WORKSPACE_AUTHORITY");
  }
  if (common !== targetCommon ||
      !target.workspaceId || target.detached ||
      !target.branch || !target.headCommit || target.headCommit === "unknown") {
    throw bad("Workspace is detached, ambiguous or belongs to another Git repository", "INVALID_WORKSPACE_AUTHORITY");
  }
  // Immutable physical worktree identity, independent of Git HEAD or branch
  // changes. The same symlink/alias MUST reserve the same workspace.
  const fingerprint = crypto.createHash("sha256")
    .update("maestro-worktree-v1\0" + common + "\0" + workspace)
    .digest("hex");
  return Object.freeze({
    root, workspace, repositoryId: canonical.repositoryId,
    workspaceId: target.workspaceId, branch: target.branch,
    headCommit: target.headCommit, fingerprint
  });
}

/**
 * This path is the ONLY admission entrypoint eligible for a future Bridge
 * executor. Never trust the caller-supplied workspaceFingerprint. Approval
 * provenance is still a separate required gate and NOT supplied by this API.
 */
async function admitCanonicalWorktreeSubmission({ store, projectRoot, workspacePath, input } = {}) {
  if (!store?.getProject || !store?.admitRunSubmission) {
    throw bad("Maestro RunStore is required", "INVALID_WORKSPACE_AUTHORITY");
  }
  const binding = bindingFromRealGitWorktree({ projectRoot, workspacePath });
  const project = input?.projectId ? await store.getProject(input.projectId) : null;
  if (!project?.path || realDirectory(project.path, "registeredProjectPath") !== binding.root) {
    throw bad("Project is not registered against this canonical Git root", "PROJECT_SCOPE_MISMATCH");
  }
  if (input.workspaceFingerprint !== undefined && input.workspaceFingerprint !== binding.fingerprint) {
    throw bad("Client workspace fingerprint does not match the physical worktree", "WORKSPACE_FINGERPRINT_MISMATCH");
  }
  const admission = normalizeAdmission({ ...input, workspaceFingerprint: binding.fingerprint });
  const result = await store.admitRunSubmission(admission);
  return Object.freeze({ ...result, binding });
}

module.exports = { bindingFromRealGitWorktree, admitCanonicalWorktreeSubmission };
