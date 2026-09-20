"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { IntentRouter } = require("../runtime/planner/intent-router.js");

const router = new IntentRouter({ maestroRoot: path.join(__dirname, "..", "orquestrador") });
const target = "skill-melhorar-ux-ui-por-referencia";

test("visual reference requests select the skill without naming it", () => {
  for (const intent of [
    "Melhore essa tela com base na referência e gere apenas o prompt.",
    "Compare estas telas e liste as diferenças.",
    "Quero deixar o login igual à referência anexada.",
    "Preciso melhorar interface a partir de screenshot.",
    "Faça um prompt de ui a partir de screenshot para o Codex.",
    "Please implement this redesign from screenshot.",
    "melhorar ux/ui por referencia"
  ]) {
    assert.equal(router.resolve(intent).primarySkill?.id, target, intent);
  }
});

test("non-interface image requests and generic UI keep their existing routes", () => {
  for (const intent of [
    "Melhore essa foto do celular.",
    "Crie uma arte promocional a partir desta imagem.",
    "Explique o erro deste print de terminal.",
    "Transcreva o texto da imagem.",
    "criar um dashboard com tabela, formulário e estados de loading",
    "corrigir responsividade, overflow e foco de teclado",
    "criar um site premium para uma fintech"
  ]) {
    const result = router.resolve(intent);
    assert.notEqual(result.primarySkill?.id, target, intent);
    assert.equal(result.allSkills.some((skill) => skill.id === target), false, intent);
  }
});

test("the previous skill name remains an explicit alias", () => {
  assert.equal(router.resolve("melhorar-ux-ui-por-referencia").primarySkill?.id, target);
  assert.equal(router.resolve("/skill:" + target).primarySkill?.id, target);
});

test("text-only routing does not pretend to inspect an attachment", () => {
  assert.notEqual(router.resolve("melhore isso").primarySkill?.id, target);
});
