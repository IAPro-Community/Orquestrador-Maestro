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
  const keyFor = (submissionId, taskId) => JSON.stringify([submissionId, taskId]);
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
    const target = task ? manifest.tasks.find(item => item.taskId === task.taskId) : manifest.tasks[0];
    if (!target || (task && JSON.stringify(target) !== JSON.stringify(task))) throw bad("Task differs from approved manifest", "EXECUTABLE_MANIFEST_MISMATCH");
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
        preparedByTask.delete(keyFor(item.submissionId, item.task.taskId));
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
        // "none" means no explicit sandbox guarantee; do not translate it
        // into an unsafe provider-specific permission escalation.
        sandbox: target.sandbox === "none" ? undefined : target.sandbox,
        model: target.modelId,
        executionTimeoutMs: target.maxDurationMs,
        durableSubmissionId: submission.id,
        durableManifestId: manifest.id,
        description: source.description,
        // Safety-only flag: keep project verification configuration immutable
        // during this trust-bound durable submission. Legacy one-shot Runs are
        // unaffected; goal acceptance is blocked if the verifier is changed.
        requireVerificationConfigIntegrity: true,
        semanticTask: {
          id: target.taskId, objective: source.description,
          acceptanceCriteria: source.acceptanceText.split("\n").map((item) => item.trim()).filter(Boolean),
          evidenceRequirements: []
        }
        // Do NOT supply verificationCommands: [] here. It is truthy and
        // disables MaestroApplication.inferProjectVerification(), allowing
        // an exit-0 provider to bypass the project's lint/test/build checks.
        // Explicit approved verifier commands require a digest-bound contract
        // before they can be introduced to this durable dispatch path.
      });
      const key = keyFor(submission.id, target.taskId);
      if (preparedByTask.has(key)) throw bad("Prepared handle already exists", "PREPARED_RUN_NOT_OWNED");
      const prepared = await application.createRun(request);
      if (!prepared?.run?.id || prepared.preflightBlock) {
        if (prepared) application.discardPreparedRun?.(prepared);
        throw bad("Maestro Run was blocked during canonical preparation",
          "PREPARED_RUN_BLOCKED");
      }
      preparedByTask.set(key, { prepared, request, submissionId: submission.id, task: target });
      return { runId: prepared.run.id, taskId: target.taskId };
    },
    async dispatchRun({ submission, task, runId, signal }) {
      const target = task || [...preparedByTask.values()]
        .find((item) => item.prepared.run.id === runId)?.task;
      const key = target && keyFor(submission?.id, target.taskId);
      const held = key && preparedByTask.get(key);
      if (!held || held.prepared.run.id !== runId || held.submissionId !== submission?.id ||
          signal?.aborted) {
        throw bad("prepared handle missing, changed or cancelled",
          "PREPARED_RUN_NOT_OWNED");
      }
      await load(submission, held.task); // Recheck Git HEAD and immutable bindings before effects.
      preparedByTask.delete(key);
      // Forward the supervisor's fenced cancellation signal to the canonical
      // MaestroApplication so the active provider handle can be cancelled.
      await application.executePreparedRun(held.prepared, held.request, { signal });
    }
  });
}

module.exports = { createApplicationSubmissionPorts };
