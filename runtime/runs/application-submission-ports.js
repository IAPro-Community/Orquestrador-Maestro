"use strict";

const crypto = require("node:crypto");
const { bad } = require("./submission-admission");
const { validateStoredExecutableManifest } = require("./executable-manifest");
const { bindingFromRealGitWorktree } = require("./workspace-authority");

const hash = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

/**
 * Narrow, trusted, in-process bridge between the fenced supervisor and the
 * existing MaestroApplication. It does not expose runs.submit or recover a
 * prepared handle after a process crash: uncertain effects stay quarantined.
 *
 * Multi-task DAGs, model-specific routing and cross-process restart still
 * require a durable execution coordinator; reject those instead of silently
 * falling back to a different provider or scheduler.
 */
function createApplicationSubmissionPorts({
  application, store, projectRoot, workspacePath, verifyApproval, resolveApprovedTask
} = {}) {
  if (!application?.createRun || !application?.executePreparedRun ||
      !store?.getExecutableManifest || typeof verifyApproval !== "function" ||
      typeof resolveApprovedTask !== "function") {
    throw bad("trusted Maestro application and artifact/approval resolvers required",
      "SUBMISSION_DISPATCH_UNAVAILABLE");
  }
  const preparedBySubmission = new Map();
  async function load(submission) {
    if (!submission?.manifestId) {
      throw bad("submission must reference a stored executable manifest",
        "EXECUTABLE_MANIFEST_REQUIRED");
    }
    const persisted = await store.getExecutableManifest(submission.manifestId);
    if (!persisted) throw bad("manifest unavailable", "EXECUTABLE_MANIFEST_NOT_FOUND");
    const manifest = validateStoredExecutableManifest(persisted);
    if (manifest.id !== submission.manifestId ||
        manifest.projectId !== submission.projectId ||
        manifest.planDigest !== submission.planDigest ||
        manifest.artifactDigest !== submission.artifactDigest ||
        manifest.tasks.length !== submission.taskCount ||
        JSON.stringify(manifest.tasks.map((task) => task.providerId)) !==
        JSON.stringify(submission.providers) ||
        manifest.maxCostUSD !== submission.maxCostUSD) {
      throw bad("prepared submission differs from immutable manifest",
        "EXECUTABLE_MANIFEST_MISMATCH");
    }
    if (manifest.tasks.length !== 1) {
      throw bad("multi-task DAG requires a durable dependency-aware scheduler",
        "MULTI_TASK_DISPATCH_UNSUPPORTED");
    }
    const task = manifest.tasks[0];
    if (task.modelId !== "default") {
      throw bad("model-specific dispatch is not certified by the current adapter",
        "MODEL_LOCK_DISPATCH_UNSUPPORTED");
    }
    const binding = bindingFromRealGitWorktree({ projectRoot, workspacePath });
    if (binding.fingerprint !== task.workspaceFingerprint ||
        binding.branch !== task.branch || binding.headCommit !== task.headCommit ||
        binding.fingerprint !== submission.workspaceFingerprint) {
      throw bad("Git scope changed since manifest approval", "MANIFEST_WORKSPACE_CHANGED");
    }
    return { manifest, task, binding };
  }
  return Object.freeze({
    verifyApproval,
    async releasePreparedRun({ submissionId } = {}) {
      const held = preparedBySubmission.get(submissionId);
      if (!held) return false;
      preparedBySubmission.delete(submissionId);
      application.discardPreparedRun?.(held.prepared);
      return true;
    },
    async prepareRun({ submission, signal }) {
      if (signal?.aborted) throw bad("submission cancelled before preparation",
        "SUBMISSION_CANCEL_REQUESTED");
      const { manifest, task, binding } = await load(submission);
      const source = await resolveApprovedTask(Object.freeze({
        manifestId: manifest.id, manifestDigest: manifest.digest,
        taskId: task.taskId, promptDigest: task.promptDigest,
        acceptanceDigest: task.acceptanceDigest
      }));
      if (typeof source?.description !== "string" || !source.description.trim() ||
          Buffer.byteLength(source.description, "utf8") > 64000 ||
          hash(source.description) !== task.promptDigest ||
          typeof source.acceptanceText !== "string" ||
          Buffer.byteLength(source.acceptanceText, "utf8") > 8000 ||
          hash(source.acceptanceText) !== task.acceptanceDigest) {
        throw bad("approved executable artifact digest mismatch",
          "EXECUTABLE_ARTIFACT_MISMATCH");
      }
      if (signal?.aborted) throw bad("submission cancelled during artifact lookup",
        "SUBMISSION_CANCEL_REQUESTED");
      const request = Object.freeze({
        projectId: manifest.projectId,
        workspacePath: binding.workspace,
        providerId: task.providerId,
        description: source.description,
        semanticTask: {
          id: task.taskId, objective: source.description,
          acceptanceCriteria: [source.acceptanceText], evidenceRequirements: []
        },
        verificationCommands: []
      });
      const prepared = await application.createRun(request);
      if (!prepared?.run?.id || prepared.preflightBlock) {
        throw bad("Maestro Run was blocked during canonical preparation",
          "PREPARED_RUN_BLOCKED");
      }
      preparedBySubmission.set(submission.id, { prepared, request });
      return { runId: prepared.run.id };
    },
    async dispatchRun({ submission, runId, signal }) {
      const held = preparedBySubmission.get(submission?.id);
      if (!held || held.prepared.run.id !== runId || signal?.aborted) {
        throw bad("prepared handle missing, changed or cancelled",
          "PREPARED_RUN_NOT_OWNED");
      }
      await load(submission); // Recheck Git HEAD and immutable bindings before effects.
      preparedBySubmission.delete(submission.id);
      await application.executePreparedRun(held.prepared, held.request);
    }
  });
}

module.exports = { createApplicationSubmissionPorts };
