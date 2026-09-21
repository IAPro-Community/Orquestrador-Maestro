"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ContextEngine } = require("../context-engine");
const { buildContextEvidenceCandidate } = require("../../resolution/evidence/signal-extractor");

function item(key, value, extra = {}) {
  return {
    key,
    value,
    kind: "FACT",
    confidence: 1,
    sources: [{ type: "package.json", path: "package.json" }],
    ...extra
  };
}

test("context evidence candidate records provenance for every scoring signal", () => {
  const candidate = buildContextEvidenceCandidate(
    "fix authentication test failure",
    item("critical.auth", "authentication test failure", { relevance: 0.9 }),
    { estimatedTokens: 12 }
  );
  assert.equal(candidate.required, true);
  assert.equal(candidate.estimatedTokens, 12);
  assert.deepEqual(Object.keys(candidate.signalProvenance).sort(), [
    "dependencyProximity",
    "failureRelation",
    "freshness",
    "relevance",
    "reliability"
  ]);
  assert.equal(candidate.signalProvenance.relevance, "context-semantic-ranker");
});

test("shadow and advisory rank evidence without changing context selection", async () => {
  const engine = new ContextEngine({ workspacePath: process.cwd(), semanticRanker: null });
  engine._discoverFacts = async () => [
    item("project.name", "demo", { relevance: 0.1 }),
    item("critical.auth", "auth requirement", { relevance: 1 }),
    item("backend.framework", "node", { relevance: 0.5 })
  ];

  const shadow = await engine.buildContext("auth", 8000, { resolutionMode: "shadow" });
  const shadowMetrics = engine.getLastBuildMetrics();
  const advisory = await engine.buildContext("auth", 8000, { resolutionMode: "advisory" });
  const advisoryMetrics = engine.getLastBuildMetrics();

  assert.deepEqual(shadow.items.map((entry) => entry.key), advisory.items.map((entry) => entry.key));
  assert.equal(shadowMetrics.evidenceRanking.applied, false);
  assert.equal(advisoryMetrics.evidenceRanking.applied, false);
  assert.equal(shadowMetrics.evidenceRanking.candidates, 3);
  assert.ok(shadowMetrics.evidenceRanking.selectedIds.length > 0);
});

test("context enforce fails closed without explicit promotion authorization", async () => {
  const engine = new ContextEngine({ workspacePath: process.cwd(), semanticRanker: null });
  engine._discoverFacts = async () => [item("project.name", "demo")];
  await assert.rejects(
    engine.buildContext("demo", 8000, { resolutionMode: "enforce" }),
    /RESOLUTION_ENFORCE_NOT_READY/u
  );
});
