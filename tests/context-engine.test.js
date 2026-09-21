const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ContextEngine } = require("../runtime/context/context-engine");
const { ContextBudget } = require("../runtime/context/context-budget");
const { evaluateBriefAuthorityCoverage, summarizeContextExperimentPairs } = require("../runtime/resolution/context-experiment");

function makeBriefProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orquestrador-engine-"));
  fs.mkdirSync(path.join(root, "DEV", "SPECS"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "produtos-api", dependencies: { express: "^4.19.0" } }), "utf8");
  fs.writeFileSync(path.join(root, "DEV", "HANDOFF.md"), "# Handoff\n\n## Next Action\n- Revisar CRUD de produtos.\n", "utf8");
  fs.writeFileSync(path.join(root, "DEV", "SPECS", "ACTIVE.md"), "# Active Spec\n\n## Goal\n- Entregar CRUD de produtos.\n", "utf8");
  return root;
}

test("P2 ContextEngine propaga a intenção real do usuário até o context brief", async () => {
  const root = makeBriefProject();
  const engine = new ContextEngine({ workspacePath: root, semanticRanker: null });

  const result = await engine.buildContext("quero criar um crud de produtos", 8000);

  const briefItem = result.items.find((item) => item.key === "context.brief");
  assert.ok(briefItem, "context.brief item should exist after intent-aware preflight");
  assert.equal(briefItem.value.task, "quero criar um crud de produtos");
  assert.match(briefItem.value.content, /intenção do maestro: quero criar um crud de produtos/ui);
});

test("ContextEngine should return deterministic facts without Local AI", async () => {
  const engine = new ContextEngine({ workspacePath: "/tmp", semanticRanker: null });
  // Mock discoverFacts to return some fixed facts
  engine._discoverFacts = async () => [
    { key: "backend.framework", value: "express", kind: "FACT", confidence: 1, relevance: 1, sources: [] }
  ];

  const result = await engine.buildContext("test intent", 8000);
  assert.strictEqual(result.intent, "test intent");
  assert.strictEqual(result.items.length, 1);
  assert.strictEqual(result.items[0].key, "backend.framework");
  assert.strictEqual(result.items[0].kind, "FACT");
});

test("ContextEngine should not convert INFERENCE into FACT when enriched", async () => {
  const mockRanker = {
    rankAndEnrich: async () => ({
      newInferences: [
        { key: "architecture.pattern", value: "REST", kind: "FACT", confidence: 0.9, relevance: 1 }
      ]
    })
  };

  const engine = new ContextEngine({ workspacePath: "/tmp", semanticRanker: mockRanker });
  engine._discoverFacts = async () => [];

  const result = await engine.buildContext("test intent", 8000);
  assert.strictEqual(result.items.length, 1);
  // It should enforce INFERENCE
  assert.strictEqual(result.items[0].kind, "INFERENCE");
  assert.strictEqual(result.items[0].confidence, 0.9);
});

test("ContextBudget prioritizes USER_DECISION regardless of budget size", () => {
  const items = [
    { key: "huge.fact", value: "x".repeat(10000), kind: "FACT", confidence: 1, relevance: 1 },
    { key: "user.choice", value: "user said yes", kind: "USER_DECISION", confidence: 1, relevance: 1 }
  ];

  const budgeted = ContextBudget.applyBudget(items, 100); // Very small budget
  assert.strictEqual(budgeted.length, 1);
  assert.strictEqual(budgeted[0].key, "user.choice");
});


test("ContextBudget charges serialized object size instead of a fixed object cost", () => {
  const huge = { key: "huge.object", value: { content: "x".repeat(12000) }, kind: "FACT", confidence: 1, relevance: 1, sources: [] };
  const small = { key: "small.fact", value: "ok", kind: "FACT", confidence: 1, relevance: 1, sources: [] };
  assert.ok(ContextBudget.estimateItemTokens(huge) > 1000);
  const selected = ContextBudget.applyBudget([huge, small], 100, { intent: "test" });
  assert.deepEqual(selected.map((item) => item.key), ["small.fact"]);
});

test("ContextEngine deduplicates DEV files already represented by context brief", async () => {
  const root = makeBriefProject();
  const engine = new ContextEngine({ workspacePath: root, semanticRanker: null });
  const result = await engine.buildContext("quero criar um crud de produtos", 8000);
  const brief = result.items.find((item) => item.key === "context.brief");
  assert.ok(brief);
  const covered = new Set(brief.value.manifest.entries.map((entry) => entry.path));
  for (const relative of ["DEV/HANDOFF.md", "DEV/SPECS/ACTIVE.md"]) {
    if (covered.has(relative)) {
      assert.equal(result.items.some((item) => item.key === `devstate.${relative}`), false);
    }
  }
  const metrics = engine.getLastBuildMetrics();
  assert.ok(metrics.deduplicatedItems >= 1);
  assert.ok(metrics.estimatedTokens > 0);
});

test("context brief value keeps compact planning data and provenance only", async () => {
  const root = makeBriefProject();
  const engine = new ContextEngine({ workspacePath: root, semanticRanker: null });
  const result = await engine.buildContext("quero criar um crud de produtos", 8000);
  const value = result.items.find((item) => item.key === "context.brief").value;
  assert.deepEqual(Object.keys(value).sort(), ["content", "manifest", "task"]);
  assert.ok(Array.isArray(value.manifest.entries));
  assert.equal("budget" in value, false);
  assert.equal("files" in value, false);
  assert.equal("state" in value, false);
});

test("paired targeted context experiment reduces the brief only when authority coverage is preserved", async () => {
  const root = makeBriefProject();
  const engine = new ContextEngine({ workspacePath: root, semanticRanker: null });
  const pairId = "context-pair-1";

  await engine.buildContext("quero criar um crud de produtos", 8000, {
    adaptiveResolutionMode: "experiment",
    adaptiveResolutionExperiment: { authorized: true, arm: "control", strategy: "targeted", pairId }
  });
  const control = engine.getLastBuildMetrics();

  await engine.buildContext("quero criar um crud de produtos", 8000, {
    adaptiveResolutionMode: "experiment",
    adaptiveResolutionExperiment: { authorized: true, arm: "treatment", strategy: "targeted", pairId }
  });
  const treatment = engine.getLastBuildMetrics();

  assert.equal(control.experiment.arm, "control");
  assert.equal(control.briefMaxChars, 8000);
  assert.equal(treatment.experiment.arm, "treatment");
  assert.equal(treatment.authorityCoverage.safe, true);
  assert.equal(treatment.briefMaxChars, treatment.experiment.applied ? 4000 : 8000);

  const summary = summarizeContextExperimentPairs([control, treatment]);
  assert.equal(summary.completePairs, 1);
  assert.equal(summary.safeTreatmentPairs, 1);
  assert.ok(Number.isFinite(summary.medianEstimatedTokenSavings));
});

test("context experiment requires explicit authorization", async () => {
  const root = makeBriefProject();
  const engine = new ContextEngine({ workspacePath: root, semanticRanker: null });
  await assert.rejects(engine.buildContext("test", 8000, {
    adaptiveResolutionMode: "experiment",
    adaptiveResolutionExperiment: { arm: "treatment", strategy: "targeted", pairId: "no-auth" }
  }), /authorized=true/u);
});


test("treatment falls back when an authority entry exists but its selected digest changes", async () => {
  const root = makeBriefProject();
  fs.writeFileSync(path.join(root, "DEV", "HANDOFF.md"), "# Handoff\n\n## Snapshot\n" + "important-current-state ".repeat(500) + "\n", "utf8");
  const engine = new ContextEngine({ workspacePath: root, semanticRanker: null });

  await engine.buildContext("quero criar um crud de produtos", 8000, {
    adaptiveResolutionMode: "experiment",
    adaptiveResolutionExperiment: { authorized: true, arm: "treatment", strategy: "targeted", pairId: "context-digest-fallback" }
  });

  const metrics = engine.getLastBuildMetrics();
  assert.equal(metrics.experiment.applied, false);
  assert.equal(metrics.briefMaxChars, 8000);
  assert.ok(["changed-authority-context", "missing-authority-context"].includes(metrics.experiment.fallbackReason));
  assert.ok(metrics.experiment.changedAuthorityEntries >= 1 || metrics.experiment.missingAuthorityEntries >= 1);
  assert.equal(metrics.authorityCoverage.safe, true);
});


test("ContextBudget keeps the serialized planning envelope within budget for non-critical items", () => {
  const items = Array.from({ length: 20 }, (_, index) => ({
    key: `fact.${index}`,
    value: "x".repeat(120),
    kind: "FACT",
    confidence: 1,
    relevance: 1,
    sources: []
  }));
  const selected = ContextBudget.applyBudget(items, 300, { intent: "bounded intent" });
  assert.ok(ContextBudget.estimateContextTokens("bounded intent", selected) <= 300);
});


test("deep authority expansion may change selected digests but may not drop required paths", () => {
  const root = makeBriefProject();
  const baseline = {
    manifest: { entries: [
      { path: "DEV state summary", digest: "state-base" },
      { path: "DEV/HANDOFF.md", digest: "handoff-base" },
      { path: "DEV/SPECS/ACTIVE.md", digest: "spec-base" }
    ] }
  };
  const expanded = {
    manifest: { entries: [
      { path: "DEV state summary", digest: "state-expanded" },
      { path: "DEV/HANDOFF.md", digest: "handoff-expanded" },
      { path: "DEV/SPECS/ACTIVE.md", digest: "spec-expanded" }
    ] }
  };
  const reducedGate = evaluateBriefAuthorityCoverage(root, expanded, baseline, { requireDigestEquality: true });
  const deepGate = evaluateBriefAuthorityCoverage(root, expanded, baseline, { requireDigestEquality: false });
  assert.equal(reducedGate.safe, false);
  assert.equal(deepGate.safe, true);
  assert.equal(deepGate.coverageRate, 1);

  const missing = {
    manifest: { entries: [
      { path: "DEV state summary", digest: "state-expanded" },
      { path: "DEV/HANDOFF.md", digest: "handoff-expanded" }
    ] }
  };
  assert.equal(evaluateBriefAuthorityCoverage(root, missing, baseline, { requireDigestEquality: false }).safe, false);
});
