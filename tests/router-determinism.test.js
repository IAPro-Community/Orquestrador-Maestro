"use strict";

// 1.1.0 (ROUT-02): routing determinism — same prompt, same primary skill,
// every run. Guards the documented tie-break in SKILLS_ROUTER.json
// (tier > specificity > priority > lexical id).
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { IntentRouter } = require("../runtime/planner/intent-router.js");

const EXPECTED = {
  "criar saas": "skill-saas-factory",
  "saas": "skill-saas-factory",
  "login saas": "skill-saas-factory",
  "corrigir responsividade, overflow e foco de teclado": "skill-frontend-ux-guardrails",
  "ux": "skill-frontend-ux-guardrails",
  "revisar escopo": "skill-scope-control",
  "o diff saiu do escopo": "skill-scope-control",
  "verifique essa resposta": "skill-doublecheck",
  "analisar ameaças": "skill-threat-modeling",
  "ameaça stride": "skill-threat-modeling",
  "criar migration": "skill-database-migrations",
  "adicionar testes": "skill-verification-before-completion",
  "clonar site": "skill-web-clone",
  "delegar": "skill-multiagent-orchestration",
  "orquestrar agentes": "skill-multiagent-orchestration",
  "playwright e2e": "skill-browser-agent",
  "migre MUI para o design system do projeto": "skill-frontend-excellence",
  "webhook stripe": "skill-stripe-integration"
};

test("ambiguous prompts resolve deterministically across repeated runs", () => {
  const router = new IntentRouter({ maestroRoot: path.resolve(__dirname, "..", "orquestrador") });
  for (const prompt of Object.keys(EXPECTED)) {
    const first = router.resolve(prompt).primarySkill?.id ?? null;
    for (let i = 0; i < 3; i += 1) {
      const again = router.resolve(prompt).primarySkill?.id ?? null;
      assert.equal(again, first, `non-deterministic routing for: ${prompt}`);
    }
  }
});

test("ambiguous prompts resolve to the documented owner skill", () => {
  const router = new IntentRouter({ maestroRoot: path.resolve(__dirname, "..", "orquestrador") });
  for (const [prompt, expected] of Object.entries(EXPECTED)) {
    const actual = router.resolve(prompt).primarySkill?.id ?? null;
    assert.equal(actual, expected, `routing changed for: ${prompt}`);
  }
});

test("router declares normalization and tie-break contract", () => {
  const fs = require("node:fs");
  const routerJson = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "orquestrador", "SKILLS_ROUTER.json"), "utf8"));
  assert.deepEqual(routerJson.tieBreak, [
    "higher-evidence-tier-wins",
    "longer-match-wins",
    "higher-priority-wins",
    "lexicographically-smallest-on-tie"
  ]);
  assert.equal(routerJson.normalization.caseInsensitive, true);
});
