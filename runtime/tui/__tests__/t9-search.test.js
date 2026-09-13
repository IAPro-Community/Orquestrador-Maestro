"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { normalizeSkills } = require("../skills/normalize");
const { SkillRegistry } = require("../../skills/registry");
const { searchSkills, levenshteinDistance, MAX_CATALOG_MS } = require("../skills/search");

function realViews() {
  return normalizeSkills(new SkillRegistry());
}

test("T9.2: damerau-levenshtein retorna distâncias esperadas", () => {
  assert.equal(levenshteinDistance("kitten", "sitting"), 3);
  assert.equal(levenshteinDistance("saas", "sas"), 1);
  assert.equal(levenshteinDistance("abc", "abc"), 0);
});

test("T9.2: busca por nome encontra skill e ranking põe prefix-exato primeiro", () => {
  const views = realViews();
  const { results } = searchSkills(views, "saas");
  assert.ok(results.length >= 3, `esperava skills de saas, obteve ${results.length}`);
  const top = views[results[0].index];
  assert.ok(
    /saas|abacatepay|stripe|core-limits|admin-dashboard|factory/i.test(top.id + top.displayName),
    `topo deve ser skill saas, foi ${top.id}`
  );
});

test("T9.2: busca por trigger/alias real encontra a skill certa", () => {
  const views = realViews();
  const byAlias = searchSkills(views, "zap");
  assert.ok(
    byAlias.results.some((r) => views[r.index].id === "skill-evolution-api"),
    "trigger 'zap' deve encontrar skill-evolution-api"
  );
  const byTrigger = searchSkills(views, "pix");
  assert.ok(
    byTrigger.results.some((r) => views[r.index].id === "skill-abacatepay-integration"),
    "trigger 'pix' deve encontrar skill-abacatepay-integration"
  );
});

test("T9.2: typo curto e consulta composta ranqueiam por todos os tokens", () => {
  const fixture = [
    { id: "skill-kubernetes", displayName: "Kubernetes", description: "Backend integral", source: "project", status: "active", triggers: ["kubernetes", "kubectl"] },
    { id: "skill-backend", displayName: "Backend", description: "Serviços parciais", source: "project", status: "active", triggers: [] }
  ];
  const kub = searchSkills(fixture, "kub");
  assert.equal(fixture[kub.results[0].index].id, "skill-kubernetes");
  const compound = searchSkills(fixture, "backend integral");
  assert.equal(fixture[compound.results[0].index].id, "skill-kubernetes");
});

test("T9.2: ranking é estável em 100 consultas com seed fixa", () => {
  const views = realViews();
  let seed = 17;
  for (let index = 0; index < 100; index++) {
    seed = (seed * 48271) % 0x7fffffff;
    const query = views[seed % views.length].id.slice(0, 8);
    assert.deepEqual(searchSkills(views, query).results, searchSkills(views, query).results);
  }
});

test("T9.2: busca por descrição/categoria normalizada acha resultados", () => {
  const views = realViews();
  const { results } = searchSkills(views, "security");
  assert.ok(results.length >= 4, "pelo menos as 4 skills de categoria security");
});

test("T9.2: performance < 5ms para o catálogo real (zero provider calls)", () => {
  const views = realViews();
  const started = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) searchSkills(views, "sec");
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsed / 20 < MAX_CATALOG_MS, `média por busca ${(elapsed / 20).toFixed(2)}ms < 5ms`);
});

test("T9.2: dedupe — sem ids repetidos no catálogo normalizado", () => {
  const views = realViews();
  const ids = new Set(views.map((v) => v.id));
  assert.equal(ids.size, views.length, "nenhum id duplicado entre sources");
});

test("T9.2: filtro de escopo e busca vazia se comportam", () => {
  const views = [
    { id: "global-supabase", displayName: "Global Supabase", source: "maestro", status: "active" },
    { id: "user-supabase", displayName: "User Supabase", source: "user", status: "active" },
    { id: "project-supabase", displayName: "Project Supabase", source: "project", status: "draft" }
  ];
  assert.equal(searchSkills(views, "").results.length, 0);
  const project = searchSkills(views, "supabase", { scope: "project" });
  assert.deepEqual(project.results.map((item) => views[item.index].source), ["project"]);
  const global = searchSkills(views, "supabase", { scope: "global" });
  assert.deepEqual(global.results.map((item) => views[item.index].source), ["maestro"]);
  const draft = searchSkills(views, "supabase", { status: "draft" });
  assert.deepEqual(draft.results.map((item) => views[item.index].id), ["project-supabase"]);
});
