"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { resolveFeatureFlags, validateFeatureFlags, isEnabled, rollbackFeatureFlags, FLAG_REGISTRY } = require("../feature-flags");
const { mergeConfig } = require("../../governance/compatibility");

test("every harness flag is default OFF even under noisy input", () => {
  const resolution = resolveFeatureFlags(undefined);
  for (const name of resolution.registry) {
    assert.equal(resolution.flags[name], false, `${name} must default to disabled`);
  }
  const noisy = resolveFeatureFlags({ "harness.specTraceability": "yes", unknownFlag: true, "harness.planPreview": 1 });
  for (const name of noisy.registry) assert.equal(noisy.flags[name], false);
  assert.equal(noisy.ignored.length, 3);
});

test("enabling is explicit, validated and reversible without deletion", () => {
  const validated = validateFeatureFlags({ "harness.specTraceability": true });
  assert.equal(validated["harness.specTraceability"], true);
  const resolved = resolveFeatureFlags(validated);
  assert.equal(isEnabled(resolved, "harness.specTraceability"), true);
  const rollback = rollbackFeatureFlags();
  assert.deepEqual(Object.values(rollback.flags), resolutionDefaultsOff());
  assert.deepEqual(rollback.enabled, []);
});

function resolutionDefaultsOff() {
  return Object.keys(FLAG_REGISTRY).map(() => false);
}

test("non-boolean and unknown flags never enable anything and are reported", () => {
  const ignored = [];
  const resolution = resolveFeatureFlags({ "harness.qualityProfiles": "on", "made.up.flag": true });
  for (const entry of resolution.ignored) ignored.push(entry.reason);
  assert.ok(ignored.includes("NON_BOOLEAN_VALUE"));
  assert.ok(ignored.includes("UNKNOWN_FLAG"));
  assert.equal(isEnabled(resolution, "harness.qualityProfiles"), false);
});

test("config features round-trips through the canonical merge", () => {
  const patched = mergeConfig({ features: { "harness.specTraceability": true } });
  assert.equal(patched.features["harness.specTraceability"], true);
  assert.equal(mergeConfig({}).features["harness.specTraceability"], false);
});

test("write path rejects unknown flags instead of storing them", () => {
  assert.throws(() => validateFeatureFlags({ "not.a.flag": true }), /unknown feature flag/iu);
  assert.throws(() => validateFeatureFlags({ "harness.planPreview": "true" }), /boolean/iu);
});

test("the registry stays small, named and documented", () => {
  for (const [name, spec] of Object.entries(FLAG_REGISTRY)) {
    assert.match(name, /^harness\./u, `${name} must be harness-scoped`);
    assert.equal(typeof spec.description, "string");
    assert.ok(spec.description.length > 10);
    assert.equal(spec.default, false);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "flags-"));
  try {
    fs.writeFileSync(path.join(temp, "config.json"), JSON.stringify({ features: { "harness.planPreview": true } }));
    const loaded = JSON.parse(fs.readFileSync(path.join(temp, "config.json"), "utf8"));
    assert.equal(resolveFeatureFlags(loaded.features).flags["harness.planPreview"], true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});