"use strict";

const { fingerprintValue, POLICY_IDENTITIES } = require("./policy-identity");

const EVIDENCE_LEVELS = Object.freeze({
  CONTEXT_ESTIMATE: "context-estimate",
  PLANNER_VALIDATED: "planner-validated",
  HARD_VALIDATED: "hard-validated"
});

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function nonEmptyOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function acceptedFromRun(run) {
  if (typeof run?.results?.accepted === "boolean") return run.results.accepted;
  if (Number.isFinite(run?.results?.acceptanceRate)) return run.results.acceptanceRate === 1;
  return false;
}

function tokensFromRun(run) {
  return finiteOrNull(run?.tokens?.total);
}

function fixtureHashFromRun(run) {
  return nonEmptyOrNull(run?.fixtureHash) || nonEmptyOrNull(run?.fixture?.hash);
}

function policyIdFromRun(run) {
  return nonEmptyOrNull(run?.policyId)
    || nonEmptyOrNull(run?.driver?.config?.adaptiveResolutionPolicyId)
    || nonEmptyOrNull(run?.driver?.config?.policyId);
}

function policyFingerprintFromRun(run) {
  return nonEmptyOrNull(run?.policyFingerprint)
    || nonEmptyOrNull(run?.driver?.config?.adaptiveResolutionPolicyFingerprint)
    || nonEmptyOrNull(run?.driver?.config?.policyFingerprint);
}

function relativeSavings(control, treatment) {
  if (!Number.isFinite(control) || !Number.isFinite(treatment) || control <= 0) return null;
  return Number(((control - treatment) / control).toFixed(6));
}

function preference({ baselineAccepted, treatmentAccepted, baselineTokens, treatmentTokens }) {
  if (baselineAccepted === true && treatmentAccepted !== true) return "baseline";
  if (treatmentAccepted === true && baselineAccepted !== true) return "treatment";
  if (baselineAccepted === true && treatmentAccepted === true && Number.isFinite(baselineTokens) && Number.isFinite(treatmentTokens)) {
    if (treatmentTokens < baselineTokens) return "treatment";
    if (baselineTokens < treatmentTokens) return "baseline";
    return "tie";
  }
  return "unknown";
}

function observedMetrics(baseline, treatment) {
  const tokenSavings = Number.isFinite(baseline.tokens) && Number.isFinite(treatment.tokens)
    ? baseline.tokens - treatment.tokens : null;
  const durationSavingsMs = Number.isFinite(baseline.durationMs) && Number.isFinite(treatment.durationMs)
    ? baseline.durationMs - treatment.durationMs : null;
  return Object.freeze({
    tokenSavings,
    relativeTokenSavings: relativeSavings(baseline.tokens, treatment.tokens),
    durationSavingsMs,
    observedPreference: preference({
      baselineAccepted: baseline.accepted,
      treatmentAccepted: treatment.accepted,
      baselineTokens: baseline.tokens,
      treatmentTokens: treatment.tokens
    })
  });
}

function normalizeAdaptiveContextReport(report = {}) {
  if (report.kind !== "adaptive-context-benchmark") throw new TypeError("not an adaptive context benchmark report");
  const identity = POLICY_IDENTITIES.CONTEXT_V2;
  const baseline = Object.freeze({
    accepted: null,
    tokens: finiteOrNull(report.control?.estimatedTokens),
    durationMs: null,
    status: "context-built"
  });
  const treatment = Object.freeze({
    accepted: null,
    tokens: finiteOrNull(report.treatment?.estimatedTokens),
    durationMs: null,
    status: report.treatment?.experiment?.applied === true ? "applied" : "fallback"
  });
  return Object.freeze({
    schemaVersion: 1,
    source: "adaptive-context",
    evidenceLevel: EVIDENCE_LEVELS.CONTEXT_ESTIMATE,
    policyId: nonEmptyOrNull(report.policyId) || identity.id,
    policyFingerprint: nonEmptyOrNull(report.policyFingerprint) || identity.fingerprint,
    policyBound: true,
    pairId: nonEmptyOrNull(report.pairId),
    taskHash: nonEmptyOrNull(report.taskHash),
    scenarioId: null,
    provider: null,
    model: null,
    integrity: Object.freeze({ valid: true, issues: Object.freeze([]) }),
    baseline,
    treatment,
    features: Object.freeze({
      taskBytes: finiteOrNull(report.taskBytes),
      strategy: nonEmptyOrNull(report.strategy),
      maxTokens: finiteOrNull(report.maxTokens),
      baselineBriefMaxChars: finiteOrNull(report.control?.briefMaxChars),
      treatmentBriefMaxChars: finiteOrNull(report.treatment?.briefMaxChars),
      treatmentApplied: report.treatment?.experiment?.applied === true,
      authoritySafe: report.treatment?.authorityCoverage?.safe === true,
      fallbackReason: nonEmptyOrNull(report.treatment?.experiment?.fallbackReason)
    }),
    observed: observedMetrics(baseline, treatment),
    promotionEligible: false
  });
}

function normalizeAdaptivePlanningReport(report = {}) {
  if (report.kind !== "adaptive-planning-benchmark") throw new TypeError("not an adaptive planning benchmark report");
  const identity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  const baseline = Object.freeze({
    accepted: null,
    tokens: finiteOrNull(report.control?.planningTelemetry?.providerTokens),
    durationMs: finiteOrNull(report.control?.planningTelemetry?.durationMs),
    status: nonEmptyOrNull(report.control?.planningMode) || "unknown"
  });
  const treatment = Object.freeze({
    accepted: null,
    tokens: finiteOrNull(report.treatment?.planningTelemetry?.providerTokens),
    durationMs: finiteOrNull(report.treatment?.planningTelemetry?.durationMs),
    status: nonEmptyOrNull(report.treatment?.planningMode) || "unknown"
  });
  return Object.freeze({
    schemaVersion: 1,
    source: "adaptive-planning",
    evidenceLevel: EVIDENCE_LEVELS.PLANNER_VALIDATED,
    policyId: nonEmptyOrNull(report.policyId) || identity.id,
    policyFingerprint: nonEmptyOrNull(report.policyFingerprint) || identity.fingerprint,
    policyBound: true,
    pairId: nonEmptyOrNull(report.pairId),
    taskHash: nonEmptyOrNull(report.taskHash),
    scenarioId: null,
    provider: nonEmptyOrNull(report.provider),
    model: nonEmptyOrNull(report.model),
    integrity: Object.freeze({ valid: true, issues: Object.freeze([]) }),
    baseline,
    treatment,
    features: Object.freeze({
      taskBytes: finiteOrNull(report.taskBytes),
      startStrategy: nonEmptyOrNull(report.treatment?.progressivePlanning?.startStrategy),
      successStrategy: nonEmptyOrNull(report.treatment?.progressivePlanning?.successStrategy),
      controlModelCalls: finiteOrNull(report.control?.planningTelemetry?.modelCalls),
      treatmentModelCalls: finiteOrNull(report.treatment?.planningTelemetry?.modelCalls),
      fallbackUsed: report.treatment?.progressivePlanning?.fallbackUsed === true,
      contextEscalations: finiteOrNull(report.treatment?.progressivePlanning?.contextEscalations),
      duplicateContextsSkipped: finiteOrNull(report.treatment?.progressivePlanning?.duplicateContextsSkipped)
    }),
    observed: observedMetrics(baseline, treatment),
    promotionEligible: false
  });
}

function benchmarkIdentityIssues(baselineRun, treatmentRun) {
  const issues = [];
  const comparableFields = [
    ["scenarioId", nonEmptyOrNull(baselineRun?.scenarioId), nonEmptyOrNull(treatmentRun?.scenarioId)],
    ["taskHash", nonEmptyOrNull(baselineRun?.taskHash), nonEmptyOrNull(treatmentRun?.taskHash)],
    ["fixtureHash", fixtureHashFromRun(baselineRun), fixtureHashFromRun(treatmentRun)],
    ["model", nonEmptyOrNull(baselineRun?.model), nonEmptyOrNull(treatmentRun?.model)],
    ["provider", nonEmptyOrNull(baselineRun?.provider), nonEmptyOrNull(treatmentRun?.provider)],
    ["driver", nonEmptyOrNull(baselineRun?.driver?.name), nonEmptyOrNull(treatmentRun?.driver?.name)]
  ];
  for (const [name, left, right] of comparableFields) {
    if (left && right && left !== right) issues.push(`${name}-mismatch`);
  }
  if (baselineRun?.status === "benchmark-integrity-violation" || treatmentRun?.status === "benchmark-integrity-violation") {
    issues.push("benchmark-integrity-violation");
  }
  return issues;
}

function normalizeBenchmarkPair(baselineRun, treatmentRun, { baselineCondition, treatmentCondition } = {}) {
  const issues = benchmarkIdentityIssues(baselineRun, treatmentRun);
  if (baselineRun?.condition !== baselineCondition) issues.push("baseline-condition-mismatch");
  if (treatmentRun?.condition !== treatmentCondition) issues.push("treatment-condition-mismatch");
  if (!nonEmptyOrNull(baselineRun?.pairId) || baselineRun.pairId !== treatmentRun?.pairId) issues.push("pair-id-mismatch");

  const baseline = Object.freeze({
    accepted: acceptedFromRun(baselineRun),
    tokens: tokensFromRun(baselineRun),
    durationMs: finiteOrNull(baselineRun?.timing?.durationMs),
    status: nonEmptyOrNull(baselineRun?.status) || "unknown"
  });
  const treatment = Object.freeze({
    accepted: acceptedFromRun(treatmentRun),
    tokens: tokensFromRun(treatmentRun),
    durationMs: finiteOrNull(treatmentRun?.timing?.durationMs),
    status: nonEmptyOrNull(treatmentRun?.status) || "unknown"
  });
  const policyFingerprint = policyFingerprintFromRun(treatmentRun);
  const policyId = policyIdFromRun(treatmentRun);
  const integrity = Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) });
  const isolatedPair = treatmentRun?.environment?.isolated === true && baselineRun?.environment?.isolated === true;
  const containerPair = treatmentRun?.environment?.container === true && baselineRun?.environment?.container === true;

  return Object.freeze({
    schemaVersion: 1,
    source: "benchmark-harness",
    evidenceLevel: EVIDENCE_LEVELS.HARD_VALIDATED,
    policyId,
    policyFingerprint,
    policyBound: Boolean(policyFingerprint),
    pairId: nonEmptyOrNull(treatmentRun?.pairId) || nonEmptyOrNull(baselineRun?.pairId),
    taskHash: nonEmptyOrNull(treatmentRun?.taskHash) || nonEmptyOrNull(baselineRun?.taskHash),
    scenarioId: nonEmptyOrNull(treatmentRun?.scenarioId) || nonEmptyOrNull(baselineRun?.scenarioId),
    provider: nonEmptyOrNull(treatmentRun?.provider) || nonEmptyOrNull(baselineRun?.provider),
    model: nonEmptyOrNull(treatmentRun?.model) || nonEmptyOrNull(baselineRun?.model),
    integrity,
    baseline,
    treatment,
    features: Object.freeze({
      baselineCondition,
      treatmentCondition,
      fixtureHash: fixtureHashFromRun(treatmentRun) || fixtureHashFromRun(baselineRun),
      isolated: isolatedPair,
      container: containerPair
    }),
    observed: observedMetrics(baseline, treatment),
    promotionEligible: Boolean(policyFingerprint) && integrity.valid && isolatedPair
  });
}

function pairBenchmarkRuns(runs = [], { baselineCondition = "maestro", treatmentCondition = "maestro-adaptive" } = {}) {
  if (!Array.isArray(runs)) throw new TypeError("benchmark runs must be an array");
  const groups = new Map();
  const unpaired = [];
  for (const run of runs) {
    if (!run || typeof run !== "object") continue;
    if (![baselineCondition, treatmentCondition].includes(run.condition)) continue;
    const pairId = nonEmptyOrNull(run.pairId);
    if (!pairId) {
      unpaired.push(nonEmptyOrNull(run.runId) || "unknown-run");
      continue;
    }
    if (!groups.has(pairId)) groups.set(pairId, { baseline: [], treatment: [] });
    const group = groups.get(pairId);
    if (run.condition === baselineCondition) group.baseline.push(run);
    if (run.condition === treatmentCondition) group.treatment.push(run);
  }

  const samples = [];
  const incompletePairs = [];
  const duplicatePairs = [];
  for (const [pairId, group] of groups.entries()) {
    if (group.baseline.length !== 1 || group.treatment.length !== 1) {
      if (group.baseline.length === 0 || group.treatment.length === 0) incompletePairs.push(pairId);
      else duplicatePairs.push(pairId);
      continue;
    }
    samples.push(normalizeBenchmarkPair(group.baseline[0], group.treatment[0], { baselineCondition, treatmentCondition }));
  }

  return Object.freeze({
    samples: Object.freeze(samples),
    diagnostics: Object.freeze({
      inputRuns: runs.length,
      candidatePairs: groups.size,
      completePairs: samples.length,
      incompletePairs: Object.freeze(incompletePairs),
      duplicatePairs: Object.freeze(duplicatePairs),
      unpairedRuns: Object.freeze(unpaired)
    })
  });
}

function buildResolutionDataset({ adaptiveReports = [], benchmarkRuns = [], baselineCondition = "maestro", treatmentCondition = "maestro-adaptive" } = {}) {
  if (!Array.isArray(adaptiveReports)) throw new TypeError("adaptiveReports must be an array");
  const samples = [];
  const rejectedReports = [];
  for (const report of adaptiveReports) {
    try {
      if (report?.kind === "adaptive-context-benchmark") samples.push(normalizeAdaptiveContextReport(report));
      else if (report?.kind === "adaptive-planning-benchmark") samples.push(normalizeAdaptivePlanningReport(report));
      else rejectedReports.push("unknown-adaptive-report");
    } catch (error) {
      rejectedReports.push(error.message);
    }
  }
  const benchmark = pairBenchmarkRuns(benchmarkRuns, { baselineCondition, treatmentCondition });
  samples.push(...benchmark.samples);

  const orderedSamples = [...samples].sort((left, right) => {
    const leftKey = [left.evidenceLevel, left.policyFingerprint || "", left.pairId || "", left.scenarioId || "", left.taskHash || "", left.source].join("|");
    const rightKey = [right.evidenceLevel, right.policyFingerprint || "", right.pairId || "", right.scenarioId || "", right.taskHash || "", right.source].join("|");
    return leftKey.localeCompare(rightKey);
  });
  const counts = {};
  for (const level of Object.values(EVIDENCE_LEVELS)) counts[level] = orderedSamples.filter((sample) => sample.evidenceLevel === level).length;
  const policyCounts = {};
  for (const sample of orderedSamples) {
    const key = sample.policyFingerprint || "unbound";
    policyCounts[key] = (policyCounts[key] || 0) + 1;
  }
  const datasetFingerprint = fingerprintValue(orderedSamples);

  return Object.freeze({
    schemaVersion: 1,
    datasetFingerprint,
    samples: Object.freeze(orderedSamples),
    summary: Object.freeze({
      samples: orderedSamples.length,
      byEvidenceLevel: Object.freeze(counts),
      byPolicyFingerprint: Object.freeze(policyCounts),
      promotionEligibleSamples: orderedSamples.filter((sample) => sample.promotionEligible).length,
      rejectedAdaptiveReports: rejectedReports.length,
      benchmarkDiagnostics: benchmark.diagnostics
    }),
    diagnostics: Object.freeze({ rejectedAdaptiveReports: Object.freeze(rejectedReports) })
  });
}

module.exports = {
  EVIDENCE_LEVELS,
  normalizeAdaptiveContextReport,
  normalizeAdaptivePlanningReport,
  normalizeBenchmarkPair,
  pairBenchmarkRuns,
  buildResolutionDataset
};
