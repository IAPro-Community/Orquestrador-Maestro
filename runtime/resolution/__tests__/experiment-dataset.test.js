"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EVIDENCE_LEVELS,
  normalizeAdaptiveContextReport,
  normalizeAdaptivePlanningReport,
  pairBenchmarkRuns,
  buildResolutionDataset
} = require("../experiment-dataset");
const { POLICY_IDENTITIES } = require("../policy-identity");

function benchmarkRun({ pairId = "pair-1", condition, accepted = true, tokens = 1000, tokenSource = "provider-reported", tokenConfidence = "exact", taskHash = "a".repeat(64), fixtureHash = "b".repeat(64), policyIdentity = null } = {}) {
  return {
    runId: `${condition}-run`,
    pairId,
    scenarioId: "scenario-1",
    condition,
    model: "model-1",
    provider: "provider-1",
    taskHash,
    fixtureHash,
    driver: {
      name: "driver-1",
      version: "1",
      config: {
        maestroRuntimeCommit: "c".repeat(40),
        ...(policyIdentity ? {
          adaptiveResolutionPolicyId: policyIdentity.id,
          adaptiveResolutionPolicyFingerprint: policyIdentity.fingerprint
        } : {})
      }
    },
    status: accepted ? "passed" : "failed",
    results: { acceptanceRate: accepted ? 1 : 0, accepted, criteria: [] },
    tokens: { total: tokens, source: tokenSource, confidence: tokenConfidence },
    timing: { durationMs: 100 },
    environment: { isolated: true, container: true, networkMode: "bridge", forwardedEnvNames: ["OPENAI_API_KEY"] }
  };
}

test("adaptive context report becomes analysis-only privacy-safe evidence", () => {
  const sample = normalizeAdaptiveContextReport({
    kind: "adaptive-context-benchmark",
    pairId: "context-1",
    taskHash: "c".repeat(64),
    taskBytes: 42,
    strategy: "targeted",
    maxTokens: 8000,
    control: { estimatedTokens: 1600, briefMaxChars: 8000 },
    treatment: { estimatedTokens: 1200, briefMaxChars: 4000, authorityCoverage: { safe: true }, experiment: { applied: true } }
  });
  assert.equal(sample.evidenceLevel, EVIDENCE_LEVELS.CONTEXT_ESTIMATE);
  assert.equal(sample.policyId, POLICY_IDENTITIES.CONTEXT_V2.id);
  assert.equal(sample.policyFingerprint, POLICY_IDENTITIES.CONTEXT_V2.fingerprint);
  assert.equal(sample.features.taskBytes, 42);
  assert.equal(sample.promotionEligible, false);
  assert.equal(sample.observed.tokenSavings, 400);
  assert.doesNotMatch(JSON.stringify(sample), /current objective|\/Users\//u);
});

test("adaptive planning report cannot promote despite provider token savings", () => {
  const sample = normalizeAdaptivePlanningReport({
    kind: "adaptive-planning-benchmark",
    pairId: "planning-1",
    taskHash: "d".repeat(64),
    provider: "opencode",
    model: "local",
    control: { planningMode: "local-ai", planningTelemetry: { providerTokens: 1000, durationMs: 50, modelCalls: 3 } },
    treatment: { planningMode: "local-ai", planningTelemetry: { providerTokens: 600, durationMs: 30, modelCalls: 1 }, progressivePlanning: { startStrategy: "targeted", successStrategy: "targeted", fallbackUsed: false, contextEscalations: 0, duplicateContextsSkipped: 0 } }
  });
  assert.equal(sample.evidenceLevel, EVIDENCE_LEVELS.PLANNER_VALIDATED);
  assert.equal(sample.policyFingerprint, POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.fingerprint);
  assert.equal(sample.promotionEligible, false);
  assert.equal(sample.observed.tokenSavings, 400);
});

test("benchmark pairs are hard validated only when identity matches and treatment is policy-bound", () => {
  const identity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  const paired = pairBenchmarkRuns([
    benchmarkRun({ condition: "maestro", tokens: 1000 }),
    benchmarkRun({ condition: "maestro-adaptive", tokens: 800, policyIdentity: identity })
  ]);
  assert.equal(paired.samples.length, 1);
  const sample = paired.samples[0];
  assert.equal(sample.evidenceLevel, EVIDENCE_LEVELS.HARD_VALIDATED);
  assert.equal(sample.integrity.valid, true);
  assert.equal(sample.policyId, identity.id);
  assert.equal(sample.policyFingerprint, identity.fingerprint);
  assert.equal(sample.policyBound, true);
  assert.equal(sample.promotionEligible, true);
  assert.equal(sample.observed.relativeTokenSavings, 0.2);
  assert.equal(sample.baseline.tokensTrusted, true);
  assert.equal(sample.treatment.tokensTrusted, true);
});

test("benchmark identity mismatch is retained as invalid evidence instead of silently paired", () => {
  const paired = pairBenchmarkRuns([
    benchmarkRun({ condition: "maestro", taskHash: "a".repeat(64) }),
    benchmarkRun({ condition: "maestro-adaptive", taskHash: "f".repeat(64), policyIdentity: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3 })
  ]);
  assert.equal(paired.samples[0].integrity.valid, false);
  assert.ok(paired.samples[0].integrity.issues.includes("taskHash-mismatch"));
  assert.equal(paired.samples[0].promotionEligible, false);
});

test("dataset is deterministic and never copies raw task or benchmark evidence content", () => {
  const input = {
    adaptiveReports: [{
      kind: "adaptive-context-benchmark",
      pairId: "privacy-1",
      task: "SECRET TASK TEXT",
      taskHash: "e".repeat(64),
      strategy: "targeted",
      control: { estimatedTokens: 1000 },
      treatment: { estimatedTokens: 800, authorityCoverage: { safe: true }, experiment: { applied: true } }
    }],
    benchmarkRuns: []
  };
  const first = buildResolutionDataset(input);
  const second = buildResolutionDataset(input);
  const reversed = buildResolutionDataset({ ...input, adaptiveReports: [...input.adaptiveReports].reverse() });
  assert.equal(first.datasetFingerprint, second.datasetFingerprint);
  assert.equal(first.datasetFingerprint, reversed.datasetFingerprint);
  assert.match(first.datasetFingerprint, /^[a-f0-9]{64}$/u);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /SECRET TASK TEXT/u);
});


test("dataset fingerprint is independent of benchmark input order", () => {
  const identity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  const runs = [
    benchmarkRun({ pairId: "p-b", condition: "maestro", tokens: 1000 }),
    benchmarkRun({ pairId: "p-b", condition: "maestro-adaptive", tokens: 800, policyIdentity: identity }),
    benchmarkRun({ pairId: "p-a", condition: "maestro", tokens: 900 }),
    benchmarkRun({ pairId: "p-a", condition: "maestro-adaptive", tokens: 700, policyIdentity: identity })
  ];
  const forward = buildResolutionDataset({ benchmarkRuns: runs });
  const reverse = buildResolutionDataset({ benchmarkRuns: [...runs].reverse() });
  assert.equal(forward.datasetFingerprint, reverse.datasetFingerprint);
  assert.deepEqual(forward.samples.map((sample) => sample.pairId), ["p-a", "p-b"]);
});


test("non-isolated policy-bound benchmark pair is hard evidence but analysis-only for promotion", () => {
  const identity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  const control = benchmarkRun({ condition: "maestro", tokens: 1000 });
  const treatment = benchmarkRun({ condition: "maestro-adaptive", tokens: 800, policyIdentity: identity });
  control.environment = { isolated: false, container: false };
  treatment.environment = { isolated: false, container: false };
  const paired = pairBenchmarkRuns([control, treatment], {
    baselineCondition: "maestro",
    treatmentCondition: "maestro-adaptive"
  });
  assert.equal(paired.samples[0].evidenceLevel, EVIDENCE_LEVELS.HARD_VALIDATED);
  assert.equal(paired.samples[0].integrity.valid, true);
  assert.equal(paired.samples[0].promotionEligible, false);
  assert.equal(paired.samples[0].features.isolated, false);
});


test("numeric benchmark tokens with weak provenance remain analysis-only for token comparisons", () => {
  const identity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  const paired = pairBenchmarkRuns([
    benchmarkRun({ condition: "maestro", tokens: 1000, tokenSource: "tokenizer-estimated", tokenConfidence: "estimated" }),
    benchmarkRun({ condition: "maestro-adaptive", tokens: 800, policyIdentity: identity })
  ]);
  const sample = paired.samples[0];
  assert.equal(sample.baseline.tokens, 1000);
  assert.equal(sample.baseline.tokensTrusted, false);
  assert.equal(sample.treatment.tokensTrusted, true);
  assert.equal(sample.observed.tokenSavings, 200);
});


test("hard benchmark pair integrity includes runtime commit, network mode, and forwarded env names", () => {
  const identity = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
  const control = benchmarkRun({ condition: "maestro", tokens: 1000 });
  const treatment = benchmarkRun({ condition: "maestro-adaptive", tokens: 800, policyIdentity: identity });

  treatment.driver.config.maestroRuntimeCommit = "d".repeat(40);
  let sample = pairBenchmarkRuns([control, treatment]).samples[0];
  assert.equal(sample.integrity.valid, false);
  assert.ok(sample.integrity.issues.includes("maestroRuntimeCommit-mismatch"));

  treatment.driver.config.maestroRuntimeCommit = control.driver.config.maestroRuntimeCommit;
  treatment.environment.networkMode = "none";
  sample = pairBenchmarkRuns([control, treatment]).samples[0];
  assert.ok(sample.integrity.issues.includes("networkMode-mismatch"));

  treatment.environment.networkMode = control.environment.networkMode;
  treatment.environment.forwardedEnvNames = ["ANTHROPIC_API_KEY"];
  sample = pairBenchmarkRuns([control, treatment]).samples[0];
  assert.ok(sample.integrity.issues.includes("forwardedEnvNames-mismatch"));
});
