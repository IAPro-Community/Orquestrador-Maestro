"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rankEvidenceCandidates } = require("../evidence-ranker");
const { buildResolutionPlan, buildResolutionTelemetry, summarizeResolutionRuns } = require("../adaptive-resolution");

test("evidence ranker deduplicates and prefers high-value bounded evidence", () => {
  const candidates = [
    { id: "failure", kind: "error", contentHash: "hash-failure", required: true, estimatedTokens: 120, relevance: 1, reliability: 1, freshness: 1, failureRelation: 1, dependencyProximity: 0.8 },
    { id: "source", kind: "source-file", contentHash: "hash-source", estimatedTokens: 800, relevance: 0.95, reliability: 0.9, freshness: 0.9, failureRelation: 0.95, dependencyProximity: 1 },
    { id: "source-copy", kind: "memory", contentHash: "hash-source", estimatedTokens: 700, relevance: 0.7, reliability: 0.7, freshness: 0.5, failureRelation: 0.5, dependencyProximity: 0.5 },
    { id: "whole-repo", kind: "repository", contentHash: "hash-repo", estimatedTokens: 50000, relevance: 0.25, reliability: 0.6, freshness: 0.8, failureRelation: 0.1, dependencyProximity: 0.1 }
  ];

  const result = rankEvidenceCandidates(candidates, { strategy: "targeted", tokenBudget: 4000 });
  assert.deepEqual(result.selected.map((item) => item.id), ["failure", "source"]);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].id, "source-copy");
  assert.equal(result.estimatedSelectedTokens, 920);
  assert.equal(result.budgetOverflow, false);
  assert.ok(result.skipped.some((item) => item.id === "whole-repo"));
  assert.equal("source" in result.selected[0], false);
});

test("resolution plan maps existing cognitive budgets instead of creating a competing budget system", () => {
  const lean = buildResolutionPlan({ cognitiveBudget: { id: "LEAN", tier: "lean", contextTokens: 4000 } });
  const standard = buildResolutionPlan({ cognitiveBudget: { id: "STANDARD", tier: "standard", contextTokens: 8000 } });
  const assurance = buildResolutionPlan({ cognitiveBudget: { id: "ASSURANCE", tier: "assurance", contextTokens: 12000 } });

  assert.equal(lean.strategy, "targeted");
  assert.equal(standard.strategy, "balanced");
  assert.equal(assurance.strategy, "deep");
  assert.equal(standard.contextTokenBudget, 8000);
  assert.throws(() => buildResolutionPlan({ mode: "enforce" }), /shadow mode only/u);
});

test("validated outcome telemetry never invents token cost", () => {
  const plan = buildResolutionPlan({ cognitiveBudget: { id: "LEAN", contextTokens: 4000 } });
  const unavailable = buildResolutionTelemetry({
    plan,
    cognitiveTelemetry: { tokenSource: "unavailable", tokenInput: null, tokenOutput: null, durationMs: 25 },
    verification: { status: "passed" },
    completion: { eligible: true },
    review: { status: "disabled" },
    status: "completed"
  });
  assert.equal(unavailable.hardValidated, true);
  assert.equal(unavailable.observedTokensToValidatedOutcome, null);
  assert.equal(unavailable.tokenMetricCompleteness, "unavailable");

  const measured = buildResolutionTelemetry({
    plan,
    cognitiveTelemetry: { tokenSource: "provider-reported", tokenInput: 500, tokenOutput: 120, durationMs: 25 },
    verification: { status: "passed" },
    completion: { eligible: true },
    review: { status: "disabled" },
    status: "completed"
  });
  assert.equal(measured.observedTokensToValidatedOutcome, 620);
  assert.equal(measured.tokenMetricCompleteness, "provider-only");
});

test("summary reports validation and observed token median", () => {
  const rows = [
    { metadata: { cognitiveTelemetry: { resolution: { hardValidated: true, observedTokensToValidatedOutcome: 600, contextBudgetOverflow: false } } } },
    { metadata: { cognitiveTelemetry: { resolution: { hardValidated: true, observedTokensToValidatedOutcome: 1000, contextBudgetOverflow: false } } } },
    { metadata: { cognitiveTelemetry: { resolution: { hardValidated: false, observedTokensToValidatedOutcome: null, contextBudgetOverflow: true } } } }
  ];
  const summary = summarizeResolutionRuns(rows);
  assert.equal(summary.runs, 3);
  assert.equal(summary.validatedRuns, 2);
  assert.equal(summary.hardValidationRate, 0.6667);
  assert.equal(summary.medianObservedTokensToValidatedOutcome, 800);
  assert.equal(summary.contextBudgetOverflowRate, 0.3333);
});
