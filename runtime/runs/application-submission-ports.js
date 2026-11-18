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
 * Multi-task manifests dispatch one Maestro Run per task in dependency order
 * (the supervisor owns the ordering); model-specific routing stays locked to
 * the provider default until adapters certify explicit models.
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
  const preparedByTask = new Map();
  async function load(submission, task) {
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
        JSON.stringify(manifest.tasks.map((item) => item.providerId)) !==
        JSON.stringify(submission.providers) ||
        manifest.maxCostUSD !== submission.maxCostUSD) {
      throw bad("prepared submission differs from immutable manifest",
        "EXECUTABLE_MANIFEST_MISMATCH");
    }
    const target = task || manifest.tasks[0];
    if (target.modelId !== "default") {
      throw bad("model-specific dispatch is not certified by the current adapter",
        "MODEL_LOCK_DISPATCH_UNSUPPORTED");
    }
    const dispatchPath = submission.workspacePaths?.[target.workspaceFingerprint] || workspacePath;
    const binding = bindingFromRealGitWorktree({ projectRoot, workspacePath: dispatchPath });
    if (binding.fingerprint !== target.workspaceFingerprint ||
        binding.branch !== target.branch || binding.headCommit !== target.headCommit) {
      throw bad("Git scope changed since manifest approval", "MANIFEST_WORKSPACE_CHANGED");
    }
    return { manifest, task: target, binding };
  }
  return Object.freeze({
    verifyApproval,
    async releasePreparedRun({ submissionId } = {}) {
      const held = [...preparedByTask.values()].filter((item) => item.submissionId === submissionId);
      for (const item of held) {
        preparedByTask.delete(item.task.taskId);
        application.discardPreparedRun?.(item.prepared);
      }
      return held.length > 0;
    },
    async prepareRun({ submission, task, signal }) {
      if (signal?.aborted) throw bad("submission cancelled before preparation",
        "SUBMISSION_CANCEL_REQUESTED");
      const { manifest, task: target, binding } = await load(submission, task);
      const source = await resolveApprovedTask(Object.freeze({
        manifestId: manifest.id, manifestDigest: manifest.digest,
        taskId: target.taskId, promptDigest: target.promptDigest,
        acceptanceDigest: target.acceptanceDigest
      }));
      if (typeof source?.description !== "string" || !source.description.trim() ||
          Buffer.byteLength(source.description, "utf8") > 64000 ||
          hash(source.description) !== target.promptDigest ||
          typeof source.acceptanceText !== "string" ||
          Buffer.byteLength(source.acceptanceText, "utf8") > 8000 ||
          hash(source.acceptanceText) !== target.acceptanceDigest) {
        throw bad("approved executable artifact digest mismatch",
          "EXECUTABLE_ARTIFACT_MISMATCH");
      }
      if (signal?.aborted) throw bad("submission cancelled during artifact lookup",
        "SUBMISSION_CANCEL_REQUESTED");
      const request = Object.freeze({
        projectId: manifest.projectId,
        workspacePath: binding.workspace,
        providerId: target.providerId,
        description: source.description,
        semanticTask: {
          id: target.taskId, objective: source.description,
          acceptanceCriteria: [source.acceptanceText], evidenceRequirements: []
        },
        verificationCommands: []
      });
      const prepared = await application.createRun(request);
      if (!prepared?.run?.id || prepared.preflightBlock) {
        throw bad("Maestro Run was blocked during canonical preparation",
          "PREPARED_RUN_BLOCKED");
      }
      preparedByTask.set(target.taskId, { prepared, request, submissionId: submission.id, task: target });
      return { runId: prepared.run.id, taskId: target.taskId };
    },
    async dispatchRun({ submission, task, runId, signal }) {
      const target = task || [...preparedByTask.values()]
        .find((item) => item.prepared.run.id === runId)?.task;
      const held = target && preparedByTask.get(target.taskId);
      if (!held || held.prepared.run.id !== runId || held.submissionId !== submission?.id ||
          signal?.aborted) {
        throw bad("prepared handle missing, changed or cancelled",
          "PREPARED_RUN_NOT_OWNED");
      }
      await load(submission, held.task); // Recheck Git HEAD and immutable bindings before effects.
      preparedByTask.delete(target.taskId);
      // Forward the supervisor's fenced cancellation signal to the canonical
      // MaestroApplication so the active provider handle can be cancelled.
      await application.executePreparedRun(held.prepared, held.request, { signal });
    }
  });
}

module.exports = { createApplicationSubmissionPorts };
