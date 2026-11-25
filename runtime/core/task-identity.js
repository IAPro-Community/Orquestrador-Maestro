"use strict";

const crypto = require("node:crypto");

function semanticTaskIdOf({ semanticTaskId, semanticTask } = {}) {
  if (typeof semanticTaskId === "string" && semanticTaskId.trim()) return semanticTaskId.trim();
  if (typeof semanticTask?.id === "string" && semanticTask.id.trim()) return semanticTask.id.trim();
  return null;
}

function storedTaskSemanticId(task = {}) {
  return task?.metadata?.semanticTaskId
    || task?.metadata?.semanticTask?.id
    || task?.metadata?.semantic?.id
    || task?.id
    || null;
}

function runtimeTaskId({ missionId, semanticTaskId, semanticTask } = {}) {
  const semanticId = semanticTaskIdOf({ semanticTaskId, semanticTask });
  if (!semanticId) return null;
  if (typeof missionId !== "string" || !missionId.trim()) return semanticId;
  const digest = crypto.createHash("sha256")
    .update(`${missionId.trim()}\0${semanticId}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `task-${digest}`;
}

function durableTaskId({ projectId, submissionId, manifestId, semanticTaskId }) {
  if (![projectId, submissionId, manifestId, semanticTaskId].every(v => typeof v === "string" && v.length)) throw new TypeError("Incomplete durable task identity");
  return "task-" + crypto.createHash("sha256").update(JSON.stringify([projectId, submissionId, manifestId, semanticTaskId])).digest("hex");
}
function matchesDurableTask(run, task, submission, semanticId) {
  if (!run || !task || run.taskId !== task.id || task.projectId !== submission.projectId) return false;
  const metadata = run.metadata || {};
  const taskMetadata = task.metadata || {};
  const modern = metadata.durableSubmissionId || metadata.durableManifestId || taskMetadata.durableSubmissionId || taskMetadata.durableManifestId;
  if (!modern) return task.id === semanticId; // historical ledger compatibility
  return metadata.durableSubmissionId === submission.id && metadata.durableManifestId === submission.manifestId &&
    taskMetadata.durableSubmissionId === submission.id && taskMetadata.durableManifestId === submission.manifestId &&
    metadata.semanticTaskId === semanticId && taskMetadata.semanticTaskId === semanticId &&
    task.id === durableTaskId({projectId:submission.projectId,submissionId:submission.id,manifestId:submission.manifestId,semanticTaskId:semanticId});
}
module.exports = { runtimeTaskId, semanticTaskIdOf, storedTaskSemanticId, durableTaskId, matchesDurableTask };
