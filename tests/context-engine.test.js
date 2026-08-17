const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ContextEngine } = require("../runtime/context/context-engine");
const { ContextBudget } = require("../runtime/context/context-budget");

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
