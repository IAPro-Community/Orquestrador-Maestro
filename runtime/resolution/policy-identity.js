"use strict";

const crypto = require("node:crypto");

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalValue(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function fingerprintValue(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

const POLICY_DESCRIPTORS = Object.freeze({
  CONTEXT_V2: Object.freeze({
    schemaVersion: 1,
    id: "adaptive-context-v2",
    family: "adaptive-context",
    baselineBriefMaxChars: 8000,
    strategyBriefMaxChars: Object.freeze({ targeted: 4000, balanced: 8000, deep: 12000 }),
    budgetAccounting: "serialized-intent-items-envelope",
    deduplication: "context-brief-manifest-covers-dev-item",
    reducedAuthorityGate: "required-entry-selected-content-digest-equality",
    expandedAuthorityGate: "required-entry-path-presence",
    fallbackOnAuthorityLoss: "baseline-8000"
  }),
  PROGRESSIVE_PLANNING_V3: Object.freeze({
    schemaVersion: 1,
    id: "adaptive-progressive-planning-v3",
    family: "adaptive-progressive-planning",
    strategies: Object.freeze(["targeted", "balanced", "deep"]),
    attemptsPerUniqueContext: 1,
    contextIdentity: "sha256-serialized-task-relevant-context",
    duplicateContextAction: "skip-model-call",
    escalateOn: Object.freeze(["validation"]),
    doNotEscalateOn: Object.freeze(["parse", "structure", "provider"]),
    terminalFallback: "deterministic-planner"
  })
});

function identityFor(descriptor) {
  return Object.freeze({
    id: descriptor.id,
    fingerprint: fingerprintValue(descriptor),
    descriptor
  });
}

const POLICY_IDENTITIES = Object.freeze({
  CONTEXT_V2: identityFor(POLICY_DESCRIPTORS.CONTEXT_V2),
  PROGRESSIVE_PLANNING_V3: identityFor(POLICY_DESCRIPTORS.PROGRESSIVE_PLANNING_V3)
});

function resolvePolicyIdentity(value) {
  const input = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!input) return null;
  for (const identity of Object.values(POLICY_IDENTITIES)) {
    if (identity.id.toLowerCase() === input || identity.fingerprint === input) return identity;
  }
  return null;
}

function resolvePolicyFingerprint(value) {
  const identity = resolvePolicyIdentity(value);
  if (identity) return identity.fingerprint;
  const input = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^[a-f0-9]{64}$/u.test(input)) return input;
  throw new TypeError("policy must be a known policy ID or a SHA-256 fingerprint");
}

module.exports = {
  POLICY_DESCRIPTORS,
  POLICY_IDENTITIES,
  canonicalJson,
  fingerprintValue,
  resolvePolicyIdentity,
  resolvePolicyFingerprint
};
