"use strict";

/**
 * Financial telemetry for provider executions.
 *
 * Contract:
 * - A cost is either the provider's own reported number or a deterministic
 *   multiplication of provider-reported tokens by an operator-maintained,
 *   versioned price table.
 * - Nothing else. Missing usage, missing price, missing cache rate or a
 *   partially priced run all yield `usd: null` with an explicit reason. A
 *   partial sum would understate real spend and could unlock a budget gate
 *   that should have stayed closed, so totals are all-or-nothing.
 * - A price table is data, not code: it carries `source` and `asOf`, and an
 *   entry is matched by exact model key only (no fuzzy vendor matching).
 */

const fs = require("node:fs");
const path = require("node:path");

const CURRENCY = "USD";
const PRICING_SCHEMA_VERSION = 1;
const COST_SCHEMA_VERSION = 1;
const DEFAULT_PRICING_FILE = path.join(__dirname, "..", "..", "docs", "product", "PROVIDER_PRICING.json");
const MAX_USAGES = 500;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function roundUSD(value) {
  return Math.round(value * 1e8) / 1e8;
}

function normalizeKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

function nonNegativeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) {
    return Number(value);
  }
  return null;
}

function nonNegativeInteger(value) {
  const numeric = nonNegativeNumber(value);
  return numeric === null ? null : Math.floor(numeric);
}

/**
 * Validates an operator-maintained price table. Malformed data is loud: a
 * wrong price table must never be silently treated as "no prices".
 */
function validatePricing(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("pricing table must be an object");
  }
  if (input.schemaVersion !== PRICING_SCHEMA_VERSION) {
    throw new TypeError(`pricing schemaVersion must be ${PRICING_SCHEMA_VERSION}`);
  }
  if (input.currency !== CURRENCY) {
    throw new TypeError(`pricing currency must be ${CURRENCY}`);
  }
  const source = typeof input.source === "string" ? input.source.trim() : "";
  if (source === "") throw new TypeError("pricing source is required (where the prices came from)");
  const asOf = typeof input.asOf === "string" ? input.asOf.trim() : "";
  if (!DATE_ONLY.test(asOf)) throw new TypeError("pricing asOf must be an ISO date (YYYY-MM-DD)");
  const models = input.models && typeof input.models === "object" && !Array.isArray(input.models)
    ? input.models : {};
  const normalized = {};
  for (const [key, entry] of Object.entries(models)) {
    const id = normalizeKey(key);
    if (!id) throw new TypeError("pricing model keys must be non-empty strings");
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`pricing entry ${key} must be an object`);
    }
    const inputPerMillionUSD = nonNegativeNumber(entry.inputPerMillionUSD);
    const outputPerMillionUSD = nonNegativeNumber(entry.outputPerMillionUSD);
    if (inputPerMillionUSD === null || outputPerMillionUSD === null) {
      throw new TypeError(`pricing entry ${key} requires numeric inputPerMillionUSD and outputPerMillionUSD`);
    }
    normalized[id] = Object.freeze({
      inputPerMillionUSD,
      outputPerMillionUSD,
      cachedInputPerMillionUSD: nonNegativeNumber(entry.cachedInputPerMillionUSD),
      cacheWritePerMillionUSD: nonNegativeNumber(entry.cacheWritePerMillionUSD)
    });
  }
  return Object.freeze({
    schemaVersion: PRICING_SCHEMA_VERSION,
    currency: CURRENCY,
    source,
    asOf,
    models: Object.freeze(normalized)
  });
}

/**
 * Reads the price table. A missing file is a legitimate "no prices known"
 * state (returns null). Invalid JSON or invalid entries throw, because a
 * corrupt table must be fixed rather than ignored.
 */
function loadPricing({ file = process.env.MAESTRO_PROVIDER_PRICING || DEFAULT_PRICING_FILE } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TypeError(`pricing file ${file} is not valid JSON`);
  }
  return validatePricing(parsed);
}

/**
 * Exact-key lookup. Candidate order is most specific first:
 * `<provider>/<model>` then `<model>`. No vendor aliasing, no name guessing.
 */
function priceFor(pricing, { provider, model } = {}) {
  if (!pricing || !pricing.models) return null;
  const modelKey = normalizeKey(model);
  if (!modelKey) return null;
  const providerKey = normalizeKey(provider);
  const candidates = [];
  if (providerKey && providerKey !== "unknown") candidates.push(`${providerKey}/${modelKey}`);
  candidates.push(modelKey);
  for (const candidate of candidates) {
    const entry = pricing.models[candidate];
    if (entry) return Object.freeze({ key: candidate, ...entry });
  }
  return null;
}

function unknownCost(reason, extra = {}) {
  return Object.freeze({ usd: null, reason, basis: "unavailable", ...extra });
}

/**
 * Cost of a single provider invocation, from its persisted usage record.
 */
function estimateUsageCost(usage, pricing) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return unknownCost("USAGE_UNRECORDED");
  }
  // 1. The provider's own billed number always wins: it already includes
  //    cache semantics and any provider-side discount.
  const reported = nonNegativeNumber(usage.costUSD);
  if (reported !== null && usage.costSource !== "unavailable") {
    return Object.freeze({ usd: roundUSD(reported), basis: "provider-reported", source: "provider-reported" });
  }
  // 2. Otherwise the run must prove complete, fresh-session token accounting.
  if (usage.usageComplete !== true) return unknownCost("USAGE_INCOMPLETE");
  const tokenInput = nonNegativeInteger(usage.tokenInput);
  const tokenOutput = nonNegativeInteger(usage.tokenOutput);
  if (tokenInput === null || tokenOutput === null) return unknownCost("TOKENS_UNAVAILABLE");
  if (!pricing) return unknownCost("PRICING_UNAVAILABLE");
  const entry = priceFor(pricing, usage);
  if (!entry) return unknownCost("PRICE_NOT_FOUND");
  const cachedInput = nonNegativeInteger(usage.cachedInputTokens);
  const cachedOutput = nonNegativeInteger(usage.cachedOutputTokens);
  if (cachedInput !== null && cachedInput > 0) {
    // Charging cached tokens at the full input rate overstates; charging them
    // at zero understates. Without an explicit cached rate the cost is unknown.
    if (entry.cachedInputPerMillionUSD === null) return unknownCost("CACHE_PRICE_MISSING");
    if (cachedInput > tokenInput) return unknownCost("CACHE_EXCEEDS_INPUT");
  }
  if (cachedOutput !== null && cachedOutput > 0 && entry.cacheWritePerMillionUSD === null) {
    return unknownCost("CACHE_WRITE_PRICE_MISSING");
  }
  const cachedPortion = cachedInput !== null && cachedInput > 0 ? cachedInput : 0;
  const freshInput = tokenInput - cachedPortion;
  const usd = (freshInput * entry.inputPerMillionUSD
    + cachedPortion * (entry.cachedInputPerMillionUSD ?? 0)
    + (cachedOutput ?? 0) * (entry.cacheWritePerMillionUSD ?? 0)
    + tokenOutput * entry.outputPerMillionUSD) / 1_000_000;
  return Object.freeze({
    usd: roundUSD(usd),
    basis: "pricing-table",
    source: `pricing-table:${pricing.asOf}`,
    priceKey: entry.key
  });
}

/**
 * Total cost of a bounded list of usages. All-or-nothing by design.
 */
function estimateCost({ usages, pricing = null } = {}) {
  if (!Array.isArray(usages)) throw new TypeError("usages must be an array");
  if (usages.length > MAX_USAGES) throw new TypeError(`at most ${MAX_USAGES} usages per assessment`);
  if (usages.length === 0) {
    return Object.freeze({
      schemaVersion: COST_SCHEMA_VERSION,
      currency: CURRENCY,
      usd: 0,
      complete: true,
      basis: "no-invocations",
      invocations: 0,
      pricing: pricing ? Object.freeze({ source: pricing.source, asOf: pricing.asOf }) : null,
      unknown: Object.freeze([])
    });
  }
  const unknown = [];
  let total = 0;
  const bases = new Set();
  for (const [index, usage] of usages.entries()) {
    const estimate = estimateUsageCost(usage, pricing);
    if (estimate.usd === null) {
      unknown.push(Object.freeze({
        index,
        reason: estimate.reason,
        tool: normalizeKey(usage?.tool) || "unknown",
        provider: normalizeKey(usage?.provider) || "unknown",
        model: normalizeKey(usage?.model) || "unknown"
      }));
      continue;
    }
    total += estimate.usd;
    bases.add(estimate.basis);
  }
  return Object.freeze({
    schemaVersion: COST_SCHEMA_VERSION,
    currency: CURRENCY,
    usd: unknown.length === 0 ? roundUSD(total) : null,
    complete: unknown.length === 0,
    basis: unknown.length > 0 ? "unavailable"
      : bases.size === 1 ? [...bases][0] : "mixed",
    invocations: usages.length,
    pricing: pricing ? Object.freeze({ source: pricing.source, asOf: pricing.asOf }) : null,
    unknown: Object.freeze(unknown)
  });
}

/**
 * Cumulative cost across Goal Loop iterations of the same approved artifact.
 * Any unknown iteration keeps the cumulative value unknown.
 */
function addCosts(values) {
  if (!Array.isArray(values)) throw new TypeError("costs must be an array");
  let total = 0;
  for (const value of values) {
    if (value === null || value === undefined) return null;
    const numeric = nonNegativeNumber(value);
    if (numeric === null) return null;
    total += numeric;
  }
  return roundUSD(total);
}

module.exports = {
  CURRENCY,
  DEFAULT_PRICING_FILE,
  PRICING_SCHEMA_VERSION,
  validatePricing,
  loadPricing,
  priceFor,
  estimateUsageCost,
  estimateCost,
  addCosts,
  roundUSD
};