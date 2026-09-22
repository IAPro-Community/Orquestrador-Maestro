"use strict";

const crypto = require("node:crypto");
const { sanitizeDiagnostic } = require("../../telemetry/diagnostic-sanitizer");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function safeText(value, maxChars = 1000) {
  return sanitizeDiagnostic(typeof value === "string" ? value : String(value ?? ""), { maxChars });
}

function strings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => safeText(item.trim(), 1000))
    : [];
}

function fileChanges(changes = {}) {
  return Object.freeze([...(changes?.changedFiles || [])]
    .filter((value) => typeof value === "string")
    .map((value) => safeText(value, 512))
    .sort());
}

function evidenceRefs(evidence = []) {
  return Object.freeze((Array.isArray(evidence) ? evidence : [])
    .filter((item) => item && typeof item === "object")
    .map((item) => Object.freeze({
      id: typeof item.id === "string" ? item.id : null,
      type: typeof item.type === "string" ? safeText(item.type, 128) : "unknown",
      acceptanceCriterion: typeof item.acceptanceCriterion === "string" ? safeText(item.acceptanceCriterion, 512) : null,
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
  const safeReason = sanitizeDiagnostic(typeof reason === "string" ? reason : "provider-failure", { maxChars: 512 });
  return Object.freeze({
    schemaVersion: 1,
    kind: "provider-checkpoint",
    checkpointId: `checkpoint-${crypto.randomUUID()}`,
    taskId: task.id || semantic.id || request.semanticTaskId || null,
    sourceRunId: run?.id || null,
    attempt: Number.isInteger(attempt) ? attempt : 1,
    providerId: providerId || run?.providerId || "unknown",
    objective: safeText(semantic.objective || request.description || task.description || "", 2000),
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
      reason: safeReason,
      reasonHash: sha256(safeReason)
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
