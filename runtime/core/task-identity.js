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

module.exports = { runtimeTaskId, semanticTaskIdOf, storedTaskSemanticId };
