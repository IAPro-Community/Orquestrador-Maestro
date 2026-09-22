"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyComplexity } = require("../complexity-gate");

test("git commit is MICRO and cannot fan out", () => {
  const result = classifyComplexity("faça um git commit dessas alterações");
  assert.equal(result.level, "MICRO");
  assert.equal(result.budget.maxSkills, 1);
  assert.equal(result.budget.allowSubagents, false);
});

test("small local test work is SIMPLE", () => {
  const result = classifyComplexity("adicionar um teste unitário para esta função");
  assert.equal(result.level, "SIMPLE");
  assert.equal(result.budget.maxSkills, 1);
});

test("authentication migration is at least COMPLEX", () => {
  const result = classifyComplexity("migrar autenticação para um novo provider");
  assert.equal(result.level, "COMPLEX");
  assert.ok(result.budget.maxSkills >= 4);
});

test("whole architecture redesign is DEEP", () => {
  const result = classifyComplexity("reestruturar a arquitetura inteira da aplicação");
  assert.equal(result.level, "DEEP");
  assert.equal(result.budget.maxSkills, 5);
});

test("risk terms prevent a mechanical-looking task from becoming MICRO", () => {
  const result = classifyComplexity("git commit da migration de produção");
  assert.equal(result.level, "COMPLEX");
});

test("file scope can escalate complexity deterministically", () => {
  assert.equal(classifyComplexity("ajustar componente", { changedFiles: ["a", "b", "c"] }).level, "STANDARD");
  assert.equal(classifyComplexity("ajustar componente", { changedFiles: Array.from({ length: 9 }, (_, i) => `f${i}`) }).level, "COMPLEX");
  assert.equal(classifyComplexity("ajustar componente", { changedFiles: Array.from({ length: 21 }, (_, i) => `f${i}`) }).level, "DEEP");
});

test("multiagent remains opt-in and only allowed for sufficiently complex work", () => {
  const simple = classifyComplexity("multiagent para corrigir typo");
  assert.equal(simple.budget.allowSubagents, false);

  const deep = classifyComplexity("multiagent para reestruturar a arquitetura inteira da aplicação");
  assert.equal(deep.level, "DEEP");
  assert.equal(deep.budget.allowSubagents, true);
});

test("explicit complexity override is validated and recorded", () => {
  const result = classifyComplexity("ajustar componente", { overrideLevel: "MICRO" });
  assert.equal(result.level, "MICRO");
  assert.ok(result.evidence.some((item) => item.kind === "explicit-override" && item.value === "MICRO"));
  assert.throws(
    () => classifyComplexity("ajustar componente", { overrideLevel: "HUGE" }),
    /complexity override must be one of/u
  );
});

test("explicit override cannot reduce high-risk work below the risk floor", () => {
  assert.throws(
    () => classifyComplexity("migration de produção", { overrideLevel: "MICRO" }),
    /cannot go below risk floor COMPLEX/u
  );
  const allowed = classifyComplexity("migration de produção", { overrideLevel: "DEEP" });
  assert.equal(allowed.level, "DEEP");
});

test("multiagent prefix does not inflate a mechanical git task", () => {
  const result = classifyComplexity("multiagent para fazer um git commit");
  assert.equal(result.level, "MICRO");
  assert.equal(result.explicitMultiagent, true);
  assert.equal(result.budget.maxSkills, 1);
  assert.equal(result.budget.maxContextTokens, 1500);
  assert.equal(result.budget.allowSubagents, false);
});
