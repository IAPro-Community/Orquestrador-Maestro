"use strict";

const crypto = require("node:crypto");

const TOKEN_ESTIMATE_ALGORITHM = "ceil(utf8-bytes/4)";

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function estimateTokensFromBytes(bytes) {
  if (!Number.isInteger(bytes) || bytes < 0) throw new TypeError("bytes must be a non-negative integer");
  return Math.ceil(bytes / 4);
}

function normalizeSection(section, index) {
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    throw new TypeError(`prompt section ${index} must be an object`);
  }
  const id = String(section.id || "").trim();
  const kind = String(section.kind || "").trim();
  const text = typeof section.text === "string" ? section.text : "";
  const content = typeof section.content === "string" ? section.content : text;
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(id)) throw new TypeError(`prompt section ${index}.id must be a stable non-sensitive identifier`);
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(kind)) throw new TypeError(`prompt section ${index}.kind must be a stable non-sensitive identifier`);
  if (text.length === 0) throw new TypeError(`prompt section ${index}.text must not be empty`);
  const bytes = Buffer.byteLength(text, "utf8");
  return Object.freeze({
    id,
    kind,
    contentHash: sha256(content),
    renderedHash: sha256(text),
    bytes,
    estimatedTokens: estimateTokensFromBytes(bytes)
  });
}

function buildMaestroPromptManifest(sections = []) {
  if (!Array.isArray(sections)) throw new TypeError("prompt sections must be an array");
  const normalized = sections.map(normalizeSection);
  const prompt = sections.map((section) => section.text).join("\n\n");
  const promptBytes = Buffer.byteLength(prompt, "utf8");
  const manifestPayload = normalized.map(({ id, kind, contentHash, renderedHash, bytes, estimatedTokens }) => ({ id, kind, contentHash, renderedHash, bytes, estimatedTokens }));
  return Object.freeze({
    version: 1,
    scope: "maestro-authored-prompt",
    hashAlgorithm: "sha256",
    tokenEstimateAlgorithm: TOKEN_ESTIMATE_ALGORITHM,
    promptHash: sha256(prompt),
    manifestHash: sha256(JSON.stringify(manifestPayload)),
    promptBytes,
    estimatedPromptTokens: estimateTokensFromBytes(promptBytes),
    itemCount: normalized.length,
    items: Object.freeze(normalized)
  });
}

function evaluateEvidenceAgainstPrompt({ plan, promptManifest } = {}) {
  if (!promptManifest) {
    return Object.freeze({
      comparisonReady: false,
      comparableSelected: 0,
      selectedWithoutHash: 0,
      selectedAlreadyPresent: 0,
      selectedNovel: 0,
      recommendationOverlapRate: null,
      promptCoverageRate: null,
      limitation: "No Maestro-authored prompt manifest was available for comparison."
    });
  }

  const selected = Array.isArray(plan?.evidence?.selected)
    ? plan.evidence.selected
    : Array.isArray(plan?.evidenceAdvice?.selected) ? plan.evidenceAdvice.selected : [];
  const comparable = selected.filter((item) => typeof item.contentHash === "string" && /^[a-f0-9]{64}$/u.test(item.contentHash));
  const selectedHashes = new Set(comparable.map((item) => item.contentHash));
  const promptHashes = new Set((promptManifest.items || []).map((item) => item.contentHash));
  const selectedAlreadyPresent = comparable.filter((item) => promptHashes.has(item.contentHash)).length;
  const promptItemsMatched = (promptManifest.items || []).filter((item) => selectedHashes.has(item.contentHash)).length;

  return Object.freeze({
    comparisonReady: comparable.length > 0,
    comparableSelected: comparable.length,
    selectedWithoutHash: selected.length - comparable.length,
    selectedAlreadyPresent,
    selectedNovel: comparable.length - selectedAlreadyPresent,
    recommendationOverlapRate: comparable.length > 0 ? Number((selectedAlreadyPresent / comparable.length).toFixed(4)) : null,
    promptCoverageRate: promptManifest.itemCount > 0 ? Number((promptItemsMatched / promptManifest.itemCount).toFixed(4)) : null,
    recommendedEstimatedTokens: plan?.evidence?.estimatedSelectedTokens ?? plan?.evidenceAdvice?.estimatedSelectedTokens ?? 0,
    maestroPromptEstimatedTokens: promptManifest.estimatedPromptTokens,
    maestroPromptBytes: promptManifest.promptBytes,
    limitation: "Overlap compares candidate SHA-256 digests only with Maestro-authored prompt sections. Provider/system context and tool-side hidden context are outside this measurement."
  });
}

module.exports = {
  TOKEN_ESTIMATE_ALGORITHM,
  sha256,
  estimateTokensFromBytes,
  buildMaestroPromptManifest,
  evaluateEvidenceAgainstPrompt
};
