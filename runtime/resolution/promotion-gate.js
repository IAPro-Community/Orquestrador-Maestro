"use strict";

const { EVIDENCE_LEVELS } = require("./experiment-dataset");

const DEFAULT_PROMOTION_POLICY = Object.freeze({
  minHardValidatedPairs: 20,
  minTokenComparablePairs: 20,
  maxAcceptanceRateRegression: 0,
  requirePositiveMedianTokenSavings: true,
  requirePairIntegrity: true,
  requirePolicyBinding: true
});

function median(values) {
  const items = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (items.length === 0) return null;
  const middle = Math.floor(items.length / 2);
  return items.length % 2 === 1 ? items[middle] : (items[middle - 1] + items[middle]) / 2;
}

function rate(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : null;
}

function evaluatePromotionGate(dataset, { candidatePolicyFingerprint, policy = DEFAULT_PROMOTION_POLICY } = {}) {
  if (!dataset || !Array.isArray(dataset.samples)) throw new TypeError("dataset.samples must be an array");
  if (typeof candidatePolicyFingerprint !== "string" || !candidatePolicyFingerprint.trim()) {
    throw new TypeError("candidatePolicyFingerprint is required");
  }
  const merged = { ...DEFAULT_PROMOTION_POLICY, ...(policy || {}) };
  for (const key of ["minHardValidatedPairs", "minTokenComparablePairs"]) {
    if (!Number.isInteger(merged[key]) || merged[key] < 1) throw new TypeError(`${key} must be a positive integer`);
  }
  if (!Number.isFinite(merged.maxAcceptanceRateRegression) || merged.maxAcceptanceRateRegression < 0 || merged.maxAcceptanceRateRegression > 1) {
    throw new TypeError("maxAcceptanceRateRegression must be between 0 and 1");
  }

  const candidate = dataset.samples.filter((sample) =>
    sample.evidenceLevel === EVIDENCE_LEVELS.HARD_VALIDATED
    && sample.policyFingerprint === candidatePolicyFingerprint);
  const bound = candidate.filter((sample) => sample.policyBound === true);
  const valid = bound.filter((sample) => sample.integrity?.valid === true);
  const invalid = bound.filter((sample) => sample.integrity?.valid !== true);

  const baselineAccepted = valid.filter((sample) => sample.baseline?.accepted === true).length;
  const treatmentAccepted = valid.filter((sample) => sample.treatment?.accepted === true).length;
  const baselineAcceptanceRate = rate(baselineAccepted, valid.length);
  const treatmentAcceptanceRate = rate(treatmentAccepted, valid.length);
  const acceptanceRateDelta = baselineAcceptanceRate !== null && treatmentAcceptanceRate !== null
    ? Number((treatmentAcceptanceRate - baselineAcceptanceRate).toFixed(6)) : null;

  const bothAccepted = valid.filter((sample) => sample.baseline?.accepted === true && sample.treatment?.accepted === true);
  const tokenComparable = bothAccepted.filter((sample) =>
    Number.isFinite(sample.baseline?.tokens) && Number.isFinite(sample.treatment?.tokens));
  const tokenSavings = tokenComparable.map((sample) => sample.baseline.tokens - sample.treatment.tokens);
  const relativeSavings = tokenComparable.map((sample) => sample.observed?.relativeTokenSavings).filter(Number.isFinite);
  const durationComparable = bothAccepted.filter((sample) =>
    Number.isFinite(sample.baseline?.durationMs) && Number.isFinite(sample.treatment?.durationMs));
  const durationSavings = durationComparable.map((sample) => sample.baseline.durationMs - sample.treatment.durationMs);

  const blockers = [];
  if (merged.requirePolicyBinding && bound.length < merged.minHardValidatedPairs) {
    blockers.push(`policy-bound-hard-pairs-below-minimum:${bound.length}/${merged.minHardValidatedPairs}`);
  } else if (candidate.length < merged.minHardValidatedPairs) {
    blockers.push(`hard-pairs-below-minimum:${candidate.length}/${merged.minHardValidatedPairs}`);
  }
  if (merged.requirePairIntegrity && invalid.length > 0) blockers.push(`invalid-pairs:${invalid.length}`);
  if (valid.length < merged.minHardValidatedPairs) blockers.push(`valid-hard-pairs-below-minimum:${valid.length}/${merged.minHardValidatedPairs}`);
  if (tokenComparable.length < merged.minTokenComparablePairs) {
    blockers.push(`token-comparable-pairs-below-minimum:${tokenComparable.length}/${merged.minTokenComparablePairs}`);
  }
  if (acceptanceRateDelta === null) blockers.push("acceptance-rate-unavailable");
  else if (acceptanceRateDelta < -merged.maxAcceptanceRateRegression) {
    blockers.push(`acceptance-regression:${acceptanceRateDelta}`);
  }
  const medianTokenSavings = median(tokenSavings);
  if (merged.requirePositiveMedianTokenSavings && !(Number.isFinite(medianTokenSavings) && medianTokenSavings > 0)) {
    blockers.push("median-token-savings-not-positive");
  }

  const qualityRegressions = valid.filter((sample) => sample.baseline?.accepted === true && sample.treatment?.accepted !== true).length;
  const qualityImprovements = valid.filter((sample) => sample.baseline?.accepted !== true && sample.treatment?.accepted === true).length;

  return Object.freeze({
    schemaVersion: 1,
    datasetFingerprint: typeof dataset.datasetFingerprint === "string" ? dataset.datasetFingerprint : null,
    candidatePolicyFingerprint,
    decision: blockers.length === 0 ? "PROMOTION_READY" : "HOLD",
    promotionReady: blockers.length === 0,
    blockers: Object.freeze(blockers),
    policy: Object.freeze({ ...merged }),
    evidence: Object.freeze({
      candidateHardPairs: candidate.length,
      policyBoundHardPairs: bound.length,
      validHardPairs: valid.length,
      invalidHardPairs: invalid.length,
      bothAcceptedPairs: bothAccepted.length,
      tokenComparablePairs: tokenComparable.length,
      durationComparablePairs: durationComparable.length
    }),
    quality: Object.freeze({
      baselineAccepted,
      treatmentAccepted,
      baselineAcceptanceRate,
      treatmentAcceptanceRate,
      acceptanceRateDelta,
      qualityRegressions,
      qualityImprovements
    }),
    economy: Object.freeze({
      medianTokenSavings,
      medianRelativeTokenSavings: median(relativeSavings),
      medianDurationSavingsMs: median(durationSavings)
    }),
    limitation: "This gate can declare evidence readiness only. It does not activate a policy, modify Runtime defaults, or train a model."
  });
}

module.exports = {
  DEFAULT_PROMOTION_POLICY,
  evaluatePromotionGate
};
