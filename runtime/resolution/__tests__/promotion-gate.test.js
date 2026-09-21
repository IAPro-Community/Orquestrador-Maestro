"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EVIDENCE_LEVELS } = require("../experiment-dataset");
const { POLICY_IDENTITIES } = require("../policy-identity");
const { evaluatePromotionGate } = require("../promotion-gate");

function sample(index, { baselineAccepted = true, treatmentAccepted = true, baselineTokens = 1000, treatmentTokens = 800, baselineTokensTrusted = true, treatmentTokensTrusted = true, integrity = true, policyBound = true, treatmentResolution = null } = {}) {
  const identity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  return {
    schemaVersion: 1,
    source: "benchmark-harness",
    evidenceLevel: EVIDENCE_LEVELS.HARD_VALIDATED,
    policyId: identity.id,
    policyFingerprint: identity.fingerprint,
    policyBound,
    pairId: `pair-${index}`,
    integrity: { valid: integrity, issues: integrity ? [] : ["taskHash-mismatch"] },
    baseline: { accepted: baselineAccepted, tokens: baselineTokens, tokenSource: "provider-reported", tokenConfidence: "exact", tokensTrusted: baselineTokensTrusted, durationMs: 100 },
    treatment: { accepted: treatmentAccepted, tokens: treatmentTokens, tokenSource: "provider-reported", tokenConfidence: "exact", tokensTrusted: treatmentTokensTrusted, durationMs: 90 },
    features: { isolated: true, container: true, treatmentResolution },
    observed: { relativeTokenSavings: baselineTokens > 0 && Number.isFinite(treatmentTokens) ? (baselineTokens - treatmentTokens) / baselineTokens : null },
    promotionEligible: policyBound && integrity
  };
}

test("promotion gate requires 20 policy-bound hard validated token-comparable pairs", () => {
  const dataset = { datasetFingerprint: "f".repeat(64), samples: Array.from({ length: 20 }, (_, index) => sample(index)) };
  const result = evaluatePromotionGate(dataset, { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint });
  assert.equal(result.promotionReady, true);
  assert.equal(result.decision, "PROMOTION_READY");
  assert.equal(result.datasetFingerprint, dataset.datasetFingerprint);
  assert.equal(result.evidence.validHardPairs, 20);
  assert.equal(result.economy.medianTokenSavings, 200);
});

test("planner/context evidence cannot satisfy the hard validation gate", () => {
  const dataset = {
    samples: Array.from({ length: 100 }, (_, index) => ({
      ...sample(index),
      evidenceLevel: index % 2 ? EVIDENCE_LEVELS.PLANNER_VALIDATED : EVIDENCE_LEVELS.CONTEXT_ESTIMATE,
      promotionEligible: false
    }))
  };
  const result = evaluatePromotionGate(dataset, { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint });
  assert.equal(result.promotionReady, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("below-minimum")));
});

test("quality regression blocks promotion even when treatment uses fewer tokens", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(index));
  samples[0] = sample(0, { treatmentAccepted: false, treatmentTokens: 500 });
  const result = evaluatePromotionGate({ samples }, { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint });
  assert.equal(result.promotionReady, false);
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("acceptance-regression:")));
  assert.equal(result.quality.qualityRegressions, 1);
});

test("missing token evidence blocks a token-optimization promotion claim", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(index, { treatmentTokens: index < 5 ? null : 800 }));
  const result = evaluatePromotionGate({ samples }, { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint });
  assert.equal(result.promotionReady, false);
  assert.ok(result.blockers.includes("token-comparable-pairs-below-minimum:15/20"));
});

test("unbound or integrity-invalid benchmark evidence cannot promote the candidate", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(index));
  samples[0] = sample(0, { integrity: false });
  samples[1] = sample(1, { policyBound: false });
  const result = evaluatePromotionGate({ samples }, { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint });
  assert.equal(result.promotionReady, false);
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("invalid-pairs:")));
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("policy-bound-hard-pairs-below-minimum:")));
});


test("non-isolated hard evidence remains analysis-only and cannot promote", () => {
  const samples = Array.from({ length: 20 }, (_, index) => ({
    ...sample(index),
    features: { isolated: false, container: false },
    promotionEligible: false
  }));
  const result = evaluatePromotionGate(
    { samples },
    { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint }
  );
  assert.equal(result.promotionReady, false);
  assert.equal(result.evidence.validHardPairs, 20);
  assert.equal(result.evidence.isolatedPromotionPairs, 0);
  assert.ok(result.blockers.includes("isolated-promotion-pairs-below-minimum:0/20"));
});


test("numeric but untrusted token provenance cannot satisfy the token-comparable promotion floor", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(index, {
    baselineTokensTrusted: index < 3 ? false : true
  }));
  const result = evaluatePromotionGate(
    { samples },
    { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint }
  );
  assert.equal(result.promotionReady, false);
  assert.equal(result.evidence.numericallyComparableTokenPairs, 20);
  assert.equal(result.evidence.tokenComparablePairs, 17);
  assert.equal(result.evidence.untrustedTokenPairs, 3);
  assert.ok(result.blockers.includes("token-comparable-pairs-below-minimum:17/20"));
});


test("promotion report exposes mission validation and efficiency rates without changing gate criteria", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(index, {
    treatmentResolution: {
      state: "validated",
      taskCount: 2,
      validatedTaskCount: 2,
      firstPassValidatedTaskCount: index < 10 ? 2 : 1,
      automaticRetries: index < 5 ? 1 : 0,
      escalations: index < 4 ? 1 : 0,
      providerSwitches: index < 2 ? 1 : 0,
      tokensToValidatedOutcome: 800 + index
    }
  }));
  const result = evaluatePromotionGate(
    { samples },
    { candidatePolicyFingerprint: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint }
  );
  assert.equal(result.promotionReady, true);
  assert.equal(result.operational.observedMissions, 20);
  assert.equal(result.operational.missionValidationRate, 1);
  assert.equal(result.operational.firstPassTaskValidationRate, 0.75);
  assert.equal(result.operational.retryMissionRate, 0.25);
  assert.equal(result.operational.escalationMissionRate, 0.2);
  assert.equal(result.operational.providerSwitchMissionRate, 0.1);
  assert.equal(result.operational.medianTokensToValidatedOutcome, 809.5);
});
