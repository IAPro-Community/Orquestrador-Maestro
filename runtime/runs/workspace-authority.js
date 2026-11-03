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

// On Windows a directory can be addressed through its 8.3 alias
// (RUNNER~1) and its long name (runneradmin). Even realpathSync can
// preserve those spellings. Use volume/file identity rather than path
// equality; fail closed if the platform cannot prove a stable identity.
function physicalDirectoryIdentity(input) {
  const resolved = realDirectory(input, "physicalDirectory");
  const stat = fs.statSync(resolved, { bigint: true });
  if (stat.ino > 0n) {
    return "inode:" + stat.dev + ":" + stat.ino;
  }
  if (process.platform === "win32") {
    throw bad("Windows directory lacks a stable file identity", "INVALID_WORKSPACE_AUTHORITY");
  }
  return "realpath:" + resolved;
}

function samePhysicalPath(left, right) {
  return physicalDirectoryIdentity(left) === physicalDirectoryIdentity(right);
}

function bindingFromRealGitWorktree({ projectRoot, workspacePath }) {
  const root = realDirectory(projectRoot, "projectRoot");
  const workspace = realDirectory(workspacePath, "workspacePath");
  const canonical = resolveGitContext(root);
  const target = resolveGitContext(workspace);
  if (canonical.vcs !== "git" || target.vcs !== "git" ||
      !samePhysicalPath(canonical.projectRoot, root) ||
      !samePhysicalPath(target.projectRoot, workspace) ||
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
  if (!samePhysicalPath(common, targetCommon) ||
      !target.workspaceId || target.detached ||
      !target.branch || !target.headCommit || target.headCommit === "unknown") {
    throw bad("Workspace is detached, ambiguous or belongs to another Git repository", "INVALID_WORKSPACE_AUTHORITY");
  }
  // Immutable physical worktree identity, independent of Git HEAD or branch
  // changes. The same symlink/alias MUST reserve the same workspace.
  const fingerprint = crypto.createHash("sha256")
    .update("maestro-worktree-v1\0" + physicalDirectoryIdentity(common) + "\0" + physicalDirectoryIdentity(workspace))
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
 * provenance must be verified by a trusted server-side callback. Without it,
 * admission fails closed; no approval flag or digest from the caller suffices.
 */
async function admitCanonicalWorktreeSubmission({ store, projectRoot, workspacePath, input, verifyApproval } = {}) {
  if (!store?.getProject || !store?.admitRunSubmission) {
    throw bad("Maestro RunStore is required", "INVALID_WORKSPACE_AUTHORITY");
  }
  const binding = bindingFromRealGitWorktree({ projectRoot, workspacePath });
  const project = input?.projectId ? await store.getProject(input.projectId) : null;
  if (!project?.path || !samePhysicalPath(project.path, binding.root)) {
    throw bad("Project is not registered against this canonical Git root", "PROJECT_SCOPE_MISMATCH");
  }
  if (input.workspaceFingerprint !== undefined && input.workspaceFingerprint !== binding.fingerprint) {
    throw bad("Client workspace fingerprint does not match the physical worktree", "WORKSPACE_FINGERPRINT_MISMATCH");
  }
  const admission = normalizeAdmission({ ...input, workspaceFingerprint: binding.fingerprint });
  if (typeof verifyApproval !== "function") {
    throw bad("trusted approval verifier is required", "APPROVAL_NOT_VERIFIED");
  }
  // This callback must resolve the persisted human approval receipt and
  // immutable plan/artifact digests from trusted Maestro state, not from the
  // client payload. A boolean argument or caller-declared approval is invalid.
  const verified = await verifyApproval(Object.freeze({
    projectId: admission.projectId,
    planDigest: admission.planDigest,
    artifactDigest: admission.artifactDigest,
    approvalDigest: admission.approvalDigest,
    workspaceFingerprint: binding.fingerprint,
    repositoryId: binding.repositoryId,
    branch: binding.branch,
    headCommit: binding.headCommit
  }));
  if (verified !== true) {
    throw bad("human approval could not be verified", "APPROVAL_NOT_VERIFIED");
  }
  // An async verifier may race with a checkout or worktree replacement.
  // Re-observe the physical worktree before reserving a submission.
  const latest = bindingFromRealGitWorktree({ projectRoot, workspacePath });
  if (latest.fingerprint !== binding.fingerprint ||
      latest.headCommit !== binding.headCommit ||
      latest.branch !== binding.branch) {
    throw bad("Git worktree changed while checking approval", "WORKSPACE_CHANGED_DURING_APPROVAL");
  }
  const result = await store.admitRunSubmission(admission);
  return Object.freeze({ ...result, binding });
}

module.exports = { bindingFromRealGitWorktree, admitCanonicalWorktreeSubmission };
