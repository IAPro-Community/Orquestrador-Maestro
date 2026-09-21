"use strict";

const fs = require("node:fs");
const path = require("node:path");

const BASELINE_BRIEF_MAX_CHARS = 8000;
const CONTEXT_STRATEGY_BRIEF_CHARS = Object.freeze({
  targeted: 4000,
  balanced: BASELINE_BRIEF_MAX_CHARS,
  deep: 12000
});
const CONTEXT_EXPERIMENT_ARMS = Object.freeze(["control", "treatment"]);
const REQUIRED_BRIEF_PATHS = Object.freeze(["AGENTS.md", "DEV/HANDOFF.md", "DEV/SPECS/ACTIVE.md"]);

function normalizeContextExperiment({ mode = "shadow", experiment } = {}) {
  if (mode !== "experiment") {
    if (experiment !== undefined && experiment !== null) throw new TypeError("context experiment requires mode=experiment");
    return null;
  }
  if (!experiment || experiment.authorized !== true) throw new TypeError("context experiment requires explicit authorized=true");
  const arm = String(experiment.arm || "");
  if (!CONTEXT_EXPERIMENT_ARMS.includes(arm)) throw new TypeError("context experiment arm must be control or treatment");
  const strategy = String(experiment.strategy || "targeted");
  if (!Object.prototype.hasOwnProperty.call(CONTEXT_STRATEGY_BRIEF_CHARS, strategy)) {
    throw new TypeError("context experiment strategy must be targeted, balanced, or deep");
  }
  const pairId = String(experiment.pairId || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(pairId)) throw new TypeError("context experiment pairId must be an opaque non-sensitive identifier");
  return Object.freeze({ version: 1, mode: "experiment", arm, strategy, pairId });
}

function requestedBriefMaxChars(contract) {
  if (!contract || contract.arm === "control") return BASELINE_BRIEF_MAX_CHARS;
  return CONTEXT_STRATEGY_BRIEF_CHARS[contract.strategy];
}

function meaningfulFile(workspacePath, relativePath) {
  const filePath = path.join(workspacePath, relativePath);
  try {
    return fs.statSync(filePath).isFile() && fs.readFileSync(filePath, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

function evaluateBriefAuthorityCoverage(workspacePath, briefValue, baselineBriefValue = briefValue) {
  const entries = Array.isArray(briefValue?.manifest?.entries) ? briefValue.manifest.entries : [];
  const baselineEntries = Array.isArray(baselineBriefValue?.manifest?.entries) ? baselineBriefValue.manifest.entries : [];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const baselineByPath = new Map(baselineEntries.map((entry) => [entry.path, entry]));
  const required = ["DEV state summary", ...REQUIRED_BRIEF_PATHS.filter((relativePath) => meaningfulFile(workspacePath, relativePath))];
  const missingFromBaseline = required.filter((relativePath) => !baselineByPath.has(relativePath));
  const missing = required.filter((relativePath) => !byPath.has(relativePath));
  const changed = required.filter((relativePath) => {
    const baseline = baselineByPath.get(relativePath);
    const candidate = byPath.get(relativePath);
    return baseline && candidate && baseline.digest !== candidate.digest;
  });
  const safe = missingFromBaseline.length === 0 && missing.length === 0 && changed.length === 0;
  const preserved = required.filter((relativePath) => baselineByPath.has(relativePath) && byPath.has(relativePath) && baselineByPath.get(relativePath).digest === byPath.get(relativePath).digest).length;
  return Object.freeze({
    safe,
    required: Object.freeze(required),
    missingFromBaseline: Object.freeze(missingFromBaseline),
    missing: Object.freeze(missing),
    changed: Object.freeze(changed),
    coverageRate: required.length > 0 ? Number((preserved / required.length).toFixed(4)) : 1
  });
}

function buildContextExperimentMetrics({ contract, requestedMaxChars, effectiveMaxChars, coverage, attemptedCoverage = coverage, fallbackReason = null, estimatedTokens, selectedItems, discoveredItems, deduplicatedItems, briefUsedChars } = {}) {
  if (!contract) return null;
  const applied = contract.arm === "treatment" && !fallbackReason && effectiveMaxChars !== BASELINE_BRIEF_MAX_CHARS;
  return Object.freeze({
    version: 1,
    pairId: contract.pairId,
    arm: contract.arm,
    strategy: contract.strategy,
    applied,
    fallbackReason,
    requestedBriefMaxChars: requestedMaxChars,
    effectiveBriefMaxChars: effectiveMaxChars,
    authorityCoverageRate: coverage?.coverageRate ?? null,
    attemptedAuthorityCoverageRate: attemptedCoverage?.coverageRate ?? null,
    missingAuthorityEntries: (attemptedCoverage?.missing?.length ?? 0) + (attemptedCoverage?.missingFromBaseline?.length ?? 0),
    changedAuthorityEntries: attemptedCoverage?.changed?.length ?? 0,
    estimatedContextTokens: Number.isFinite(estimatedTokens) ? estimatedTokens : null,
    selectedItems: Number.isInteger(selectedItems) ? selectedItems : null,
    discoveredItems: Number.isInteger(discoveredItems) ? discoveredItems : null,
    deduplicatedItems: Number.isInteger(deduplicatedItems) ? deduplicatedItems : null,
    briefUsedChars: Number.isInteger(briefUsedChars) ? briefUsedChars : null,
    limitation: "Context token counts are deterministic serialization estimates. End-to-end provider input remains separately measured by provider telemetry."
  });
}

function median(values) {
  const items = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (items.length === 0) return null;
  const middle = Math.floor(items.length / 2);
  return items.length % 2 === 1 ? items[middle] : (items[middle - 1] + items[middle]) / 2;
}

function summarizeContextExperimentPairs(metrics = []) {
  if (!Array.isArray(metrics)) throw new TypeError("metrics must be an array");
  const pairs = new Map();
  for (const metric of metrics) {
    const experiment = metric?.experiment;
    if (!experiment?.pairId || !CONTEXT_EXPERIMENT_ARMS.includes(experiment.arm)) continue;
    if (!pairs.has(experiment.pairId)) pairs.set(experiment.pairId, {});
    pairs.get(experiment.pairId)[experiment.arm] = metric;
  }
  const complete = [...pairs.values()].filter((pair) => pair.control && pair.treatment);
  const comparable = complete.filter((pair) => Number.isFinite(pair.control.estimatedTokens) && Number.isFinite(pair.treatment.estimatedTokens));
  const savings = comparable.map((pair) => pair.control.estimatedTokens - pair.treatment.estimatedTokens);
  return Object.freeze({
    experimentPairs: pairs.size,
    completePairs: complete.length,
    comparablePairs: comparable.length,
    safeTreatmentPairs: complete.filter((pair) => pair.treatment.experiment?.applied === true && pair.treatment.authorityCoverage?.safe === true).length,
    medianEstimatedTokenSavings: median(savings)
  });
}

module.exports = {
  BASELINE_BRIEF_MAX_CHARS,
  CONTEXT_STRATEGY_BRIEF_CHARS,
  CONTEXT_EXPERIMENT_ARMS,
  normalizeContextExperiment,
  requestedBriefMaxChars,
  evaluateBriefAuthorityCoverage,
  buildContextExperimentMetrics,
  summarizeContextExperimentPairs
};
