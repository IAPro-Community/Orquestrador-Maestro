"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rankEvidenceCandidates } = require("../evidence-ranker");
const { buildResolutionPlan, buildResolutionTelemetry, summarizeResolutionRuns } = require("../adaptive-resolution");
const { buildMaestroPromptManifest, sha256 } = require("../prompt-manifest");
const { normalizeContextExperiment, requestedBriefMaxChars } = require("../context-experiment");

test("evidence ranker deduplicates and prefers high-value bounded evidence", () => {
  const candidates = [
    { id: "failure", kind: "error", contentHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", required: true, estimatedTokens: 120, relevance: 1, reliability: 1, freshness: 1, failureRelation: 1, dependencyProximity: 0.8 },
    { id: "source", kind: "source-file", contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", estimatedTokens: 800, relevance: 0.95, reliability: 0.9, freshness: 0.9, failureRelation: 0.95, dependencyProximity: 1 },
    { id: "source-copy", kind: "memory", contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", estimatedTokens: 700, relevance: 0.7, reliability: 0.7, freshness: 0.5, failureRelation: 0.5, dependencyProximity: 0.5 },
    { id: "whole-repo", kind: "repository", contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", estimatedTokens: 50000, relevance: 0.25, reliability: 0.6, freshness: 0.8, failureRelation: 0.1, dependencyProximity: 0.1 }
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
  const promptManifest = buildMaestroPromptManifest([{ id: "task", kind: "task", content: "fix regression", text: "Task: fix regression" }]);
  const plan = buildResolutionPlan({
    cognitiveBudget: { id: "LEAN", contextTokens: 4000 },
    evidenceCandidates: [{ id: "task-section", kind: "task", contentHash: sha256("fix regression"), required: true, estimatedTokens: 10, relevance: 1, reliability: 1, freshness: 1, failureRelation: 1, dependencyProximity: 1 }]
  });
  const unavailable = buildResolutionTelemetry({
    plan,
    cognitiveTelemetry: { tokenSource: "unavailable", tokenInput: null, tokenOutput: null, durationMs: 25 },
    verification: { status: "passed" },
    completion: { eligible: true },
    review: { status: "disabled" },
    promptManifest,
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
    promptManifest,
    status: "completed"
  });
  assert.equal(measured.observedTokensToValidatedOutcome, 620);
  assert.equal(measured.tokenMetricCompleteness, "provider-only");
  assert.equal(measured.promptEvaluation.comparisonReady, true);
  assert.equal(measured.promptEvaluation.recommendationOverlapRate, 1);
  assert.equal(measured.maestroPrompt.promptHash, promptManifest.promptHash);
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

test("prompt manifest stores hashes and measurements but never raw prompt content", () => {
  const secretText = "Workspace: /Users/alice/private/project API_KEY=synthetic-secret";
  const manifest = buildMaestroPromptManifest([{ id: "workspace", kind: "workspace", text: secretText }]);
  const serialized = JSON.stringify(manifest);
  assert.equal(manifest.promptHash, sha256(secretText));
  assert.equal(manifest.itemCount, 1);
  assert.doesNotMatch(serialized, /alice|synthetic-secret|\/Users\/alice/u);
});

test("evidence candidates reject path-like ids and non-digest content hashes", () => {
  assert.throws(() => rankEvidenceCandidates([
    { id: "src/auth/file.js", kind: "source", estimatedTokens: 10, relevance: 1, reliability: 1, freshness: 1, failureRelation: 1, dependencyProximity: 1 }
  ], { strategy: "targeted", tokenBudget: 100 }), /opaque identifier/u);
  assert.throws(() => rankEvidenceCandidates([
    { id: "source-file", kind: "source", contentHash: "raw-content", estimatedTokens: 10, relevance: 1, reliability: 1, freshness: 1, failureRelation: 1, dependencyProximity: 1 }
  ], { strategy: "targeted", tokenBudget: 100 }), /SHA-256/u);
});


test("context experiment policy is explicit and keeps control on the existing baseline", () => {
  const control = normalizeContextExperiment({ mode: "experiment", experiment: { authorized: true, arm: "control", strategy: "targeted", pairId: "pair-control" } });
  const treatment = normalizeContextExperiment({ mode: "experiment", experiment: { authorized: true, arm: "treatment", strategy: "targeted", pairId: "pair-treatment" } });
  assert.equal(requestedBriefMaxChars(control), 8000);
  assert.equal(requestedBriefMaxChars(treatment), 4000);
  assert.throws(() => normalizeContextExperiment({ mode: "experiment", experiment: { arm: "treatment", strategy: "targeted", pairId: "pair-x" } }), /authorized=true/u);
});
