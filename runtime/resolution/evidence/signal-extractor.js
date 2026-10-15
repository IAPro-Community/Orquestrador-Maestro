"use strict";

const crypto = require("node:crypto");

const SIGNAL_NAMES = Object.freeze(["relevance", "reliability", "freshness", "failureRelation", "dependencyProximity"]);
const FAILURE_TERMS = new Set(["error", "erro", "fail", "failed", "failure", "falha", "bug", "regression", "regressao", "test", "teste", "exception", "timeout"]);

function clamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function tokenize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3);
}

function overlapRatio(intent, item) {
  const intentTokens = new Set(tokenize(intent));
  if (intentTokens.size === 0) return 0;
  const itemTokens = new Set(tokenize(`${item?.key || ""} ${typeof item?.value === "string" ? item.value : JSON.stringify(item?.value ?? "")}`));
  let overlap = 0;
  for (const token of intentTokens) if (itemTokens.has(token)) overlap += 1;
  return clamp(overlap / intentTokens.size);
}

function failureRelation(intent, item) {
  const relevantIntent = tokenize(intent).filter((token) => FAILURE_TERMS.has(token));
  if (relevantIntent.length === 0) return 0;
  const itemTokens = new Set(tokenize(`${item?.key || ""} ${typeof item?.value === "string" ? item.value : JSON.stringify(item?.value ?? "")}`));
  return clamp(relevantIntent.filter((token) => itemTokens.has(token)).length / relevantIntent.length);
}

function directWorkspaceSource(item) {
  return (item?.sources || []).some((source) => ["package.json", "dev-file", "context-brief", "agents-contract"].includes(source?.type));
}

function reliability(item) {
  if (item?.kind === "FACT" || item?.kind === "USER_DECISION") return 1;
  return clamp(item?.confidence);
}

function freshness(item) {
  // These sources are read from the current workspace during this collection.
  // This measures observation freshness, not semantic truth freshness.
  return directWorkspaceSource(item) ? 1 : 0;
}

function dependencyProximity(item) {
  return directWorkspaceSource(item) ? 1 : 0;
}

function safeValueHash(item) {
  let serialized;
  try { serialized = JSON.stringify(item?.value); } catch { serialized = String(item?.value ?? ""); }
  return crypto.createHash("sha256").update(serialized ?? "", "utf8").digest("hex");
}

function opaqueEvidenceId(item) {
  return `ctx-${crypto.createHash("sha256").update(String(item?.key || "unknown"), "utf8").digest("hex").slice(0, 20)}`;
}

function extractEvidenceSignals(intent, item) {
  const measuredRelevance = Number.isFinite(item?.relevance) ? clamp(item.relevance) : overlapRatio(intent, item);
  const signals = Object.freeze({
    relevance: measuredRelevance,
    reliability: reliability(item),
    freshness: freshness(item),
    failureRelation: failureRelation(intent, item),
    dependencyProximity: dependencyProximity(item)
  });
  const provenance = Object.freeze({
    relevance: Number.isFinite(item?.relevance) ? "context-semantic-ranker" : "deterministic-token-overlap",
    reliability: ["FACT", "USER_DECISION"].includes(item?.kind) ? "context-kind" : "context-confidence",
    freshness: directWorkspaceSource(item) ? "current-workspace-collection" : "unavailable",
    failureRelation: "deterministic-failure-term-overlap",
    dependencyProximity: directWorkspaceSource(item) ? "direct-workspace-source" : "unavailable"
  });
  return Object.freeze({ signals, provenance });
}

function buildContextEvidenceCandidate(intent, item, { estimatedTokens = 0 } = {}) {
  const { signals, provenance } = extractEvidenceSignals(intent, item);
  return Object.freeze({
    id: opaqueEvidenceId(item),
    kind: String(item?.kind || "unknown").toLowerCase(),
    contentHash: safeValueHash(item),
    required: item?.kind === "USER_DECISION"
      || String(item?.key || "").startsWith("critical.")
      || String(item?.key || "").startsWith("blocking."),
    estimatedTokens,
    ...signals,
    signalProvenance: provenance
  });
}

module.exports = {
  SIGNAL_NAMES,
  tokenize,
  extractEvidenceSignals,
  buildContextEvidenceCandidate
};
