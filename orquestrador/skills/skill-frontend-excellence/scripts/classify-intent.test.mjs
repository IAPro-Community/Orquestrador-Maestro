import { classifyIntent } from "./classify-intent.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

test("migrate MUI preserves visual", () => {
  const result = classifyIntent("migre essa tela de MUI para o design system do projeto");
  assert.equal(result.intent, "MIGRATE");
  assert.equal(result.posture, "PRESERVE");
  assert.equal(result.creativity, "none");
});

test("fix mobile stays preserve/low", () => {
  const result = classifyIntent("corrija essa tela no mobile");
  assert.equal(result.intent, "FIX");
  assert.equal(result.posture, "PRESERVE");
  assert.equal(result.creativity, "low");
});

test("modernize login is redesign/explore/high", () => {
  const result = classifyIntent("moderniza o login");
  assert.equal(result.intent, "REDESIGN");
  assert.equal(result.posture, "EXPLORE");
  assert.equal(result.creativity, "high");
});

test("profile can cap creativity", () => {
  const result = classifyIntent("moderniza o login", "low");
  assert.equal(result.intent, "REDESIGN");
  assert.equal(result.creativity, "low");
  assert.equal(result.profileCapped, true);
});

test("add filter is create/evolve", () => {
  const result = classifyIntent("adicione um filtro novo");
  assert.equal(result.intent, "CREATE");
  assert.equal(result.posture, "EVOLVE");
});

test("refactor is preserve none", () => {
  const result = classifyIntent("refatore este frontend para TypeScript");
  assert.equal(result.intent, "REFACTOR");
  assert.equal(result.posture, "PRESERVE");
  assert.equal(result.creativity, "none");
});
