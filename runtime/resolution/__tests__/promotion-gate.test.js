"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EVIDENCE_LEVELS } = require("../experiment-dataset");
const { POLICY_IDENTITIES } = require("../policy-identity");
const { evaluatePromotionGate } = require("../promotion-gate");

function sample(index, { baselineAccepted = true, treatmentAccepted = true, baselineTokens = 1000, treatmentTokens = 800, integrity = true, policyBound = true } = {}) {
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
    baseline: { accepted: baselineAccepted, tokens: baselineTokens, durationMs: 100 },
    treatment: { accepted: treatmentAccepted, tokens: treatmentTokens, durationMs: 90 },
    features: { isolated: true, container: true },
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
