"use strict";

const crypto = require("node:crypto");

/**
 * Maestro-controlled worker context (Minimum Sufficient Workflow).
 *
 * Reuses Context Brief/Memory instead of a new Context Engine: the leader
 * owns full session replay, workers receive only a bounded pack and pull
 * more on demand. Workers return evidence/results; only the leader integrates
 * and updates shared DEV/HANDOFF/WORKLOG memory (leader-owned persistence).
 */

const SPAWN_REASONS = Object.freeze([
  "independent-workstream",
  "focused-investigation",
  "specialized-review",
  "blocked-primary",
  "conflicting-evidence",
  "specialized-verification"
]);

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function truncate(text, limit) {
  const value = String(text || "");
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: value.slice(0, Math.max(0, limit - 20)) + "\n[truncated]", truncated: true };
}

function buildWorkerContextPack({
  objective,
  acceptanceCriteria = [],
  evidence = [],
  files = [],
  decisions = [],
  constraints = [],
  expectedOutput = "",
  verificationTarget = "",
  scope = "",
  maxChars = 4000
} = {}) {
  if (typeof objective !== "string" || objective.trim() === "") throw new TypeError("objective is required");
  const sections = [];
  sections.push(`Objective:\n${objective.trim()}`);
  if (acceptanceCriteria.length > 0) sections.push(`Acceptance:\n${acceptanceCriteria.map((c) => `- ${String(c)}`).join("\n")}`);
  if (evidence.length > 0) sections.push(`Evidence:\n${evidence.slice(0, 10).map((e) => `- ${String(e?.summary || e)}`).join("\n")}`);
  if (files.length > 0) sections.push(`Files:\n${files.slice(0, 20).map((f) => `- ${String(f)}`).join("\n")}`);
  if (decisions.length > 0) sections.push(`Decisions:\n${decisions.slice(0, 10).map((d) => `- ${String(d)}`).join("\n")}`);
  if (constraints.length > 0) sections.push(`Constraints:\n${constraints.slice(0, 10).map((c) => `- ${String(c)}`).join("\n")}`);
  if (expectedOutput) sections.push(`Expected output:\n${String(expectedOutput).slice(0, 500)}`);
  if (verificationTarget) sections.push(`Verification:\n${String(verificationTarget).slice(0, 500)}`);
  if (scope) sections.push(`Scope:\n${String(scope).slice(0, 500)}`);
  const full = sections.join("\n\n");
  const bounded = truncate(full, maxChars);
  return Object.freeze({
    objective: objective.trim(),
    pack: bounded.text,
    chars: bounded.text.length,
    truncated: bounded.truncated,
    digest: sha256Hex(bounded.text).slice(0, 32),
    counts: Object.freeze({
      acceptanceCriteria: acceptanceCriteria.length,
      evidence: Math.min(evidence.length, 10),
      files: Math.min(files.length, 20)
    })
  });
}

// Ralph proportionality: simplification/deslop only with a real signal.
// Returns { simplify: bool, skipReason } so trivial diffs skip the model call.
function shouldSimplify({ findings = [], diffStats = null, explicitRequest = false, complexitySignal = false } = {}) {
  if (explicitRequest) return Object.freeze({ simplify: true, skipReason: null });
  const reviewerSignal = Array.isArray(findings) && findings.some((f) => /duplic|unnecessary|abstraction|slop|complex/i.test(String(f?.code || f?.message || f || "")));
  if (reviewerSignal) return Object.freeze({ simplify: true, skipReason: null });
  if (complexitySignal) return Object.freeze({ simplify: true, skipReason: null });
  if (diffStats && typeof diffStats === "object") {
    const files = Number(diffStats.filesChanged) || 0;
    const added = Number(diffStats.linesAdded) || 0;
    // Trivial diffs (<5 files, <100 lines, tests present) skip by default.
    if (files > 0 && files < 5 && added < 100) {
      return Object.freeze({ simplify: false, skipReason: "no-simplification-signal" });
    }
  }
  return Object.freeze({ simplify: false, skipReason: "no-simplification-signal" });
}

function assertSpawnReason(reason) {
  if (!SPAWN_REASONS.includes(reason)) throw new TypeError(`spawnReason must be one of: ${SPAWN_REASONS.join(", ")}`);
  return reason;
}

module.exports = { SPAWN_REASONS, buildWorkerContextPack, shouldSimplify, assertSpawnReason };
