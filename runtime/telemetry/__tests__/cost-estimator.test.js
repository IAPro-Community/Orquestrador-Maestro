"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  validatePricing, loadPricing, priceFor, estimateUsageCost, estimateCost, addCosts
} = require("../cost-estimator");

const pricingFixture = () => validatePricing({
  schemaVersion: 1,
  currency: "USD",
  asOf: "2026-11-01",
  source: "fixture: provider pricing page",
  models: {
    "anthropic/claude-test": {
      inputPerMillionUSD: 3,
      outputPerMillionUSD: 15,
      cachedInputPerMillionUSD: 0.3
    },
    "gpt-test": { inputPerMillionUSD: 1, outputPerMillionUSD: 4 }
  }
});

const usage = (overrides = {}) => ({
  tool: "claude",
  provider: "anthropic",
  model: "claude-test",
  tokenInput: 1_000_000,
  tokenOutput: 1_000_000,
  cachedInputTokens: null,
  cachedOutputTokens: null,
  usageComplete: true,
  costUSD: null,
  costSource: "unavailable",
  ...overrides
});

test("provider-reported cost is used verbatim and never re-derived", () => {
  const estimate = estimateUsageCost({
    ...usage(), costUSD: 0.4213, costSource: "provider-reported",
    tokenInput: null, tokenOutput: null, usageComplete: false
  }, undefined);
  assert.equal(estimate.usd, 0.4213);
  assert.equal(estimate.basis, "provider-reported");
});

test("token math uses the matching price entry exactly", () => {
  const estimate = estimateUsageCost(usage(), pricingFixture());
  assert.equal(estimate.basis, "pricing-table");
  assert.equal(estimate.usd, 18); // 1M input @3 + 1M output @15
  assert.equal(estimate.priceKey, "anthropic/claude-test");
});

test("cached input is priced at the cached rate, never at zero or full price", () => {
  const estimate = estimateUsageCost(usage({ tokenInput: 1_000_000, tokenOutput: 0, cachedInputTokens: 400_000 }), pricingFixture());
  assert.equal(estimate.basis, "pricing-table");
  const expected = (600_000 * 3 + 400_000 * 0.3) / 1_000_000;
  assert.equal(estimate.usd, Math.round(expected * 1e8) / 1e8);
});

test("unknown stays unknown: incomplete usage, missing price, missing cache rate", () => {
  const pricing = pricingFixture();
  assert.equal(estimateUsageCost(usage({ usageComplete: false }), pricing).reason, "USAGE_INCOMPLETE");
  assert.equal(estimateUsageCost(usage({ model: "unpriced-model" }), pricing).reason, "PRICE_NOT_FOUND");
  assert.equal(estimateUsageCost(usage({ tokenInput: 10, cachedInputTokens: 5, model: "gpt-test" }), pricing).reason, "CACHE_PRICE_MISSING");
  assert.equal(estimateUsageCost(usage({ cachedInputTokens: 5 }), null).reason, "PRICING_UNAVAILABLE");
  assert.equal(estimateUsageCost(usage({ tokenInput: null }), pricing).reason, "TOKENS_UNAVAILABLE");
  assert.equal(estimateUsageCost(null, pricing).reason, "USAGE_UNRECORDED");
});

test("a partially priced run is never reported as a cheaper total", () => {
  const pricing = pricingFixture();
  const total = estimateCost({
    pricing,
    usages: [usage({ tokenOutput: 0 }), usage({ model: "unpriced-model" })]
  });
  assert.equal(total.complete, false);
  assert.equal(total.usd, null);
  assert.equal(total.invocations, 2);
  assert.equal(total.unknown.length, 1);
  assert.equal(total.unknown[0].reason, "PRICE_NOT_FOUND");
  assert.equal(total.unknown[0].model, "unpriced-model");
});

test("mixed bases are labelled and zero invocations is an exact zero", () => {
  const pricing = pricingFixture();
  const total = estimateCost({
    pricing,
    usages: [usage({ tokenOutput: 0 }), usage({ costUSD: 2, costSource: "provider-reported" })]
  });
  assert.equal(total.complete, true);
  assert.equal(total.basis, "mixed");
  assert.equal(total.usd, 5); // 1M input @3 + provider-reported 2
  const none = estimateCost({ usages: [] });
  assert.equal(none.usd, 0);
  assert.equal(none.basis, "no-invocations");
  assert.equal(none.complete, true);
});

test("malformed price tables are rejected instead of silently ignored", () => {
  assert.throws(() => validatePricing({ schemaVersion: 1, currency: "USD", source: "x", asOf: "2026-11-01", models: { a: { inputPerMillionUSD: 1 } } }), /outputPerMillionUSD/);
  assert.throws(() => validatePricing({ schemaVersion: 1, currency: "USD", source: "x", asOf: "yesterday", models: {} }), /asOf/);
  assert.throws(() => validatePricing({ schemaVersion: 1, currency: "USD", source: "", asOf: "2026-11-01", models: {} }), /source/);
  assert.throws(() => validatePricing({ schemaVersion: 2, currency: "USD", source: "x", asOf: "2026-11-01", models: {} }), /schemaVersion/);
});

test("a missing price file means no prices, not a crash", () => {
  const missing = path.join(os.tmpdir(), `maestro-pricing-${Date.now()}-absent.json`);
  assert.equal(loadPricing({ file: missing }), null);
  const file = path.join(os.tmpdir(), `maestro-pricing-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, currency: "USD", asOf: "2026-11-01", source: "s", models: { model: { inputPerMillionUSD: 1, outputPerMillionUSD: 2 } } }));
  try {
    const loaded = loadPricing({ file });
    assert.equal(Object.keys(loaded.models).length, 1);
    assert.equal(priceFor(loaded, { provider: "openai", model: "model" }).inputPerMillionUSD, 1);
  } finally {
    fs.rmSync(file, { force: true });
  }
  fs.writeFileSync(file, "{not json");
  try {
    assert.throws(() => loadPricing({ file }), /not valid JSON/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("cumulative cost stays unknown when any iteration is unknown", () => {
  assert.equal(addCosts([1.5, 2.5]), 4);
  assert.equal(addCosts([1.5, null]), null);
  assert.equal(addCosts([1.5, -1]), null);
  assert.equal(addCosts([]), 0);
});

test("shipped pricing table validates and prices nothing it cannot cite", () => {
  const shipped = loadPricing({ file: path.join(__dirname, "..", "..", "..", "docs", "product", "PROVIDER_PRICING.json") });
  assert.equal(shipped.currency, "USD");
  assert.equal(shipped.models["gpt-5"] ?? null, null);
});