"use strict";

const { validateID, validateDigest, bad } = require("./submission-admission");
const { bindingFromRealGitWorktree, admitCanonicalWorktreeSubmission } = require("./workspace-authority");
const { validateStoredExecutableManifest } = require("./executable-manifest");

/**
 * Internal fail-closed adapter for a set of physical worktrees. v1 reserves
 * the canonical project worktree plus up to four additional worktrees
 * atomically; every manifest task fingerprint must be covered. No public
 * runs.submit endpoint or provider execution is enabled here.
 */
async function admitManifestBoundSubmission({
  store, manifestId, projectRoot, workspacePath, clientKey, approvalDigest,
  verifyApproval, extraWorkspaces
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

  const primary = bindingFromRealGitWorktree({ projectRoot, workspacePath });
  const bindings = new Map([[primary.fingerprint, { ...primary, workspacePath: String(workspacePath) }]]);
  for (const extra of extraWorkspaces || []) {
    const binding = bindingFromRealGitWorktree({ projectRoot, workspacePath: extra.workspacePath });
    if (!bindings.has(binding.fingerprint)) {
      bindings.set(binding.fingerprint, { ...binding, workspacePath: String(extra.workspacePath) });
    }
  }
  const fingerprints = [...new Set(manifest.tasks.map((task) => task.workspaceFingerprint))];
  if (extraWorkspaces === undefined) {
    // Legacy single-worktree contract: every task must match the primary.
    if (fingerprints.length !== 1 || fingerprints[0] !== primary.fingerprint) {
      throw bad("multi-worktree submission requires an atomic workspace-set ledger", "MANIFEST_MULTI_WORKTREE_UNSUPPORTED");
    }
  } else {
    if (extraWorkspaces.length < 1 || extraWorkspaces.length > 4) {
      throw bad("multi-worktree submission requires 1..4 additional worktrees", "MANIFEST_MULTI_WORKTREE_UNSUPPORTED");
    }
    for (const fingerprint of fingerprints) {
      if (!bindings.has(fingerprint)) {
        throw bad("manifest references a worktree outside the reserved workspace set", "MANIFEST_WORKSPACE_CHANGED");
      }
    }
  }
  for (const task of manifest.tasks) {
    const binding = bindings.get(task.workspaceFingerprint);
    if (task.headCommit !== binding.headCommit || task.branch !== binding.branch) {
      throw bad("manifest was prepared against a different Git checkout", "MANIFEST_WORKSPACE_CHANGED");
    }
  }
  const orderedFingerprints = fingerprints.sort();
  const durations = manifest.tasks.reduce((total, task) => total + task.maxDurationMs, 0);
  if (durations > 7_200_000) {
    throw bad("total duration exceeds ledger limit", "MANIFEST_LIMIT_EXCEEDED");
  }
  // Dispatch paths cover the whole reserved set: the canonical root plus
  // every manifest fingerprint it does not already contain.
  const reservedFingerprints = [...new Set([primary.fingerprint, ...orderedFingerprints])];
  const workspacePaths = {};
  for (const fingerprint of reservedFingerprints) {
    workspacePaths[fingerprint] = bindings.get(fingerprint).workspacePath;
  }
  const extraFingerprints = reservedFingerprints.filter((fp) => fp !== primary.fingerprint);
  const submission = {
    projectId: manifest.projectId, clientKey,
    manifestId: manifest.id, planDigest: manifest.planDigest,
    artifactDigest: manifest.artifactDigest, approvalDigest,
    taskCount: manifest.tasks.length, providers: manifest.tasks.map((task) => task.providerId),
    maxAttempts: Math.max(...manifest.tasks.map((task) => task.maxAttempts)),
    maxDurationMs: durations,
    maxCostUSD: manifest.maxCostUSD,
    workspaceFingerprint: primary.fingerprint,
    ...(extraFingerprints.length > 0 ? { extraWorkspaceFingerprints: extraFingerprints } : {}),
    workspacePaths
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
