"use strict";

const DEFAULT_POLICY = Object.freeze({
  version: 1,
  minimumPriorityScore: 0.12,
  tokenScale: 1000,
  weights: Object.freeze({
    relevance: 0.35,
    reliability: 0.15,
    freshness: 0.10,
    failureRelation: 0.25,
    dependencyProximity: 0.15
  }),
  maxCandidates: Object.freeze({ targeted: 6, balanced: 15, deep: 30 })
});

function clampUnit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeCandidate(candidate, index) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError(`evidence candidate ${index} must be an object`);
  }
  const estimatedTokens = Number(candidate.estimatedTokens ?? 0);
  if (!Number.isInteger(estimatedTokens) || estimatedTokens < 0) {
    throw new TypeError(`evidence candidate ${index}.estimatedTokens must be a non-negative integer`);
  }
  const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `candidate-${index}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id)) {
    throw new TypeError(`evidence candidate ${index}.id must be an opaque identifier without paths or user data`);
  }
  const contentHash = typeof candidate.contentHash === "string" && candidate.contentHash.trim() ? candidate.contentHash.trim().toLowerCase() : null;
  if (contentHash !== null && !/^[a-f0-9]{64}$/u.test(contentHash)) {
    throw new TypeError(`evidence candidate ${index}.contentHash must be a SHA-256 hex digest`);
  }
  return Object.freeze({
    id,
    kind: typeof candidate.kind === "string" ? candidate.kind : "unknown",
    contentHash,
    required: candidate.required === true,
    estimatedTokens,
    relevance: clampUnit(candidate.relevance),
    reliability: clampUnit(candidate.reliability),
    freshness: clampUnit(candidate.freshness),
    failureRelation: clampUnit(candidate.failureRelation),
    dependencyProximity: clampUnit(candidate.dependencyProximity)
  });
}

function scoreCandidate(candidate, policy = DEFAULT_POLICY) {
  const weights = policy.weights || DEFAULT_POLICY.weights;
  const informationValue =
    candidate.relevance * Number(weights.relevance ?? 0) +
    candidate.reliability * Number(weights.reliability ?? 0) +
    candidate.freshness * Number(weights.freshness ?? 0) +
    candidate.failureRelation * Number(weights.failureRelation ?? 0) +
    candidate.dependencyProximity * Number(weights.dependencyProximity ?? 0);
  const tokenScale = Math.max(1, Number(policy.tokenScale || DEFAULT_POLICY.tokenScale));
  const costFactor = 1 / (1 + candidate.estimatedTokens / tokenScale);
  return Object.freeze({
    ...candidate,
    informationValue: Number(informationValue.toFixed(6)),
    costFactor: Number(costFactor.toFixed(6)),
    priorityScore: Number((informationValue * costFactor).toFixed(6))
  });
}

function deduplicateCandidates(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = candidate.contentHash ? `hash:${candidate.contentHash}` : `id:${candidate.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }

  const unique = [];
  const duplicates = [];
  for (const group of groups.values()) {
    const ordered = group.slice().sort((a, b) => Number(b.required) - Number(a.required) || b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
    unique.push(ordered[0]);
    for (const duplicate of ordered.slice(1)) duplicates.push(Object.freeze({ id: duplicate.id, duplicateOf: ordered[0].id }));
  }
  return Object.freeze({ unique: Object.freeze(unique), duplicates: Object.freeze(duplicates) });
}

function rankEvidenceCandidates(candidates = [], { strategy = "targeted", tokenBudget = 0, policy = DEFAULT_POLICY } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError("evidence candidates must be an array");
  if (!Object.prototype.hasOwnProperty.call(policy.maxCandidates || {}, strategy)) throw new TypeError(`unknown resolution strategy: ${strategy}`);
  if (!Number.isInteger(tokenBudget) || tokenBudget < 0) throw new TypeError("tokenBudget must be a non-negative integer");

  const scored = candidates.map((candidate, index) => scoreCandidate(normalizeCandidate(candidate, index), policy));
  const { unique, duplicates } = deduplicateCandidates(scored);
  const required = unique.filter((item) => item.required).sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  const optional = unique.filter((item) => !item.required).sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  const maxCandidates = Number(policy.maxCandidates[strategy]);
  const minimumPriorityScore = Number(policy.minimumPriorityScore ?? 0);

  const selected = [];
  const skipped = [];
  let estimatedSelectedTokens = 0;
  let budgetOverflow = false;

  for (const item of required) {
    selected.push(item);
    estimatedSelectedTokens += item.estimatedTokens;
    if (estimatedSelectedTokens > tokenBudget) budgetOverflow = true;
  }

  for (const item of optional) {
    if (item.priorityScore < minimumPriorityScore) {
      skipped.push(Object.freeze({ id: item.id, reason: "below-minimum-score", priorityScore: item.priorityScore, estimatedTokens: item.estimatedTokens }));
      continue;
    }
    if (selected.length >= maxCandidates) {
      skipped.push(Object.freeze({ id: item.id, reason: "candidate-limit", priorityScore: item.priorityScore, estimatedTokens: item.estimatedTokens }));
      continue;
    }
    if (estimatedSelectedTokens + item.estimatedTokens > tokenBudget) {
      skipped.push(Object.freeze({ id: item.id, reason: "token-budget", priorityScore: item.priorityScore, estimatedTokens: item.estimatedTokens }));
      continue;
    }
    selected.push(item);
    estimatedSelectedTokens += item.estimatedTokens;
  }

  return Object.freeze({
    policyVersion: Number(policy.version || 1),
    strategy,
    tokenBudget,
    estimatedSelectedTokens,
    budgetOverflow,
    selected: Object.freeze(selected.map((item) => Object.freeze({
      id: item.id,
      kind: item.kind,
      contentHash: item.contentHash,
      required: item.required,
      estimatedTokens: item.estimatedTokens,
      informationValue: item.informationValue,
      costFactor: item.costFactor,
      priorityScore: item.priorityScore
    }))),
    skipped: Object.freeze(skipped),
    duplicates,
    stats: Object.freeze({ inputCandidates: candidates.length, uniqueCandidates: unique.length, selectedCandidates: selected.length })
  });
}

module.exports = { DEFAULT_POLICY, clampUnit, normalizeCandidate, scoreCandidate, rankEvidenceCandidates };
