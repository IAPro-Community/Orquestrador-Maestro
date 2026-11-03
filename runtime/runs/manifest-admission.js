"use strict";

const { validateID, validateDigest, bad } = require("./submission-admission");
const { bindingFromRealGitWorktree, admitCanonicalWorktreeSubmission } = require("./workspace-authority");
const { validateStoredExecutableManifest } = require("./executable-manifest");

/**
 * Internal fail-closed adapter for a *single* physical worktree.
 * A multi-worktree DAG cannot be admitted with the existing single-lock
 * ledger: that needs an atomic set-of-worktrees reservation first.
 * No public runs.submit endpoint or provider execution is enabled here.
 */
async function admitManifestBoundSubmission({
  store, manifestId, projectRoot, workspacePath, clientKey, approvalDigest,
  verifyApproval
} = {}) {
  validateID(manifestId, "manifestId");
  validateID(clientKey, "clientKey");
  validateDigest(approvalDigest, "approvalDigest");
  if (typeof verifyApproval !== "function" ||
      typeof store?.getExecutableManifest !== "function") {
    throw bad("trusted approval verifier and persistent manifest store are required", "MANIFEST_ADMISSION_UNAVAILABLE");
  }
  const persisted = await store.getExecutableManifest(manifestId);
  if (!persisted) throw bad("executable manifest does not exist", "EXECUTABLE_MANIFEST_NOT_FOUND");
  const manifest = validateStoredExecutableManifest(persisted);
  if (manifest.id !== manifestId) {
    throw bad("persisted manifest identity mismatch", "EXECUTABLE_MANIFEST_MISMATCH");
  }

  const binding = bindingFromRealGitWorktree({ projectRoot, workspacePath });
  const fingerprints = new Set(manifest.tasks.map((task) => task.workspaceFingerprint));
  if (fingerprints.size !== 1 || !fingerprints.has(binding.fingerprint)) {
    throw bad("multi-worktree submission requires an atomic workspace-set ledger", "MANIFEST_MULTI_WORKTREE_UNSUPPORTED");
  }
  if (manifest.tasks.some((task) => task.headCommit !== binding.headCommit ||
      task.branch !== binding.branch)) {
    throw bad("manifest was prepared against a different Git checkout", "MANIFEST_WORKSPACE_CHANGED");
  }
  const durations = manifest.tasks.reduce((total, task) => total + task.maxDurationMs, 0);
  if (durations > 7_200_000) {
    throw bad("total duration exceeds ledger limit", "MANIFEST_LIMIT_EXCEEDED");
  }
  const submission = {
    projectId: manifest.projectId, clientKey,
    manifestId: manifest.id, planDigest: manifest.planDigest,
    artifactDigest: manifest.artifactDigest, approvalDigest,
    taskCount: manifest.tasks.length, providers: manifest.tasks.map((task) => task.providerId),
    maxAttempts: Math.max(...manifest.tasks.map((task) => task.maxAttempts)),
    maxDurationMs: durations,
    maxCostUSD: manifest.maxCostUSD
  };
  return admitCanonicalWorktreeSubmission({
    store, projectRoot, workspacePath, input: submission,
    verifyApproval: async (subject) => {
      // Only an in-process trusted verifier can grant an approval. Its
      // evidence must bind the *entire* immutable manifest, not just a
      // mutable client-provided planDigest or approvalDigest.
      const authorized = await verifyApproval(Object.freeze({
        ...subject,
        manifestId: manifest.id,
        manifestDigest: manifest.digest,
        executableTasks: manifest.tasks.map((task) => Object.freeze({
          taskId: task.taskId, providerId: task.providerId, modelId: task.modelId,
          promptDigest: task.promptDigest, acceptanceDigest: task.acceptanceDigest,
          workspaceFingerprint: task.workspaceFingerprint, branch: task.branch,
          headCommit: task.headCommit
        }))
      }));
      return authorized === true;
    }
  });
}

module.exports = { admitManifestBoundSubmission };
