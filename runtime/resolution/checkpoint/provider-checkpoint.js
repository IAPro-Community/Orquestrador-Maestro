"use strict";

const crypto = require("node:crypto");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function fileChanges(changes = {}) {
  return Object.freeze([...(changes?.changedFiles || [])].filter((value) => typeof value === "string").sort());
}

function evidenceRefs(evidence = []) {
  return Object.freeze((Array.isArray(evidence) ? evidence : [])
    .filter((item) => item && typeof item === "object")
    .map((item) => Object.freeze({
      id: typeof item.id === "string" ? item.id : null,
      type: typeof item.type === "string" ? item.type : "unknown",
      acceptanceCriterion: typeof item.acceptanceCriterion === "string" ? item.acceptanceCriterion : null,
      verificationId: typeof item.verificationId === "string" ? item.verificationId : null
    })));
}

function buildProviderCheckpoint({
  task = {},
  request = {},
  run,
  attempt,
  providerId,
  reason,
  changes,
  evidence,
  verification,
  review,
  remainingBudget
} = {}) {
  const semantic = request.semanticTask || task.metadata?.semanticTask || task.metadata?.semantic || {};
  const decisions = strings(request.decisions || request.missionBrief?.userDecisions);
  const requirements = strings(semantic.requirements || request.missionBrief?.requirements);
  return Object.freeze({
    schemaVersion: 1,
    kind: "provider-checkpoint",
    checkpointId: `checkpoint-${crypto.randomUUID()}`,
    taskId: task.id || semantic.id || request.semanticTaskId || null,
    sourceRunId: run?.id || null,
    attempt: Number.isInteger(attempt) ? attempt : 1,
    providerId: providerId || run?.providerId || "unknown",
    objective: semantic.objective || request.description || task.description || "",
    requirements: Object.freeze(requirements),
    decisions: Object.freeze(decisions),
    filesChanged: fileChanges(changes),
    evidence: evidenceRefs(evidence),
    verification: verification ? Object.freeze({
      id: verification.id || null,
      status: verification.status || "unknown",
      checkCount: Array.isArray(verification.checks) ? verification.checks.length : 0
    }) : null,
    review: review ? Object.freeze({
      status: review.status || "unknown",
      verdict: review.verdict || "unknown"
    }) : null,
    remainingBudget: remainingBudget && typeof remainingBudget === "object"
      ? Object.freeze({ ...remainingBudget }) : null,
    failure: Object.freeze({
      reason: typeof reason === "string" ? reason.slice(0, 512) : "provider-failure",
      reasonHash: sha256(reason || "provider-failure")
    }),
    createdAt: new Date().toISOString()
  });
}

function checkpointPrompt(checkpoint) {
  if (!checkpoint || checkpoint.kind !== "provider-checkpoint") return "";
  const lines = [
    "Provider-neutral continuation checkpoint:",
    `Task: ${checkpoint.taskId || "unknown"}`,
    `Objective: ${checkpoint.objective || ""}`,
    checkpoint.requirements.length ? `Requirements: ${checkpoint.requirements.join(" | ")}` : "",
    checkpoint.decisions.length ? `Decisions: ${checkpoint.decisions.join(" | ")}` : "",
    checkpoint.filesChanged.length ? `Files changed in previous attempts: ${checkpoint.filesChanged.join(", ")}` : "",
    checkpoint.evidence.length ? `Evidence refs: ${checkpoint.evidence.map((item) => item.id || item.type).join(", ")}` : "",
    checkpoint.verification ? `Previous verification: ${checkpoint.verification.status}` : "",
    checkpoint.review ? `Previous review: ${checkpoint.review.status}` : "",
    `Previous attempt ended because: ${checkpoint.failure.reason}`,
    "Continue from this state. Do not repeat completed work unless verification requires it."
  ].filter(Boolean);
  return lines.join("\n");
}

module.exports = { buildProviderCheckpoint, checkpointPrompt };
