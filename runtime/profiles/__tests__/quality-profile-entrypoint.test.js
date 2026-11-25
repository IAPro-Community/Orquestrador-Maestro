"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getQualityProfile, evaluateQualityEvidence } = require("..");
const { resolveFeatureFlags } = require("../../config/feature-flags");

const disabled = resolveFeatureFlags({});
const enabled = resolveFeatureFlags({ "harness.qualityProfiles": true });

test("quality profiles stay off unless the harness flag is proven enabled", () => {
  assert.equal(getQualityProfile({ stack: "node", features: disabled }), null);
  assert.equal(getQualityProfile({ stack: "node" }), null);
  assert.equal(getQualityProfile({ stack: "node", features: { flags: { "harness.qualityProfiles": "true" } } }), null);
});

test("an enabled flag exposes the stack profile through the shared entrypoint", () => {
  const profile = getQualityProfile({ stack: "node", ui: true, features: enabled });
  assert.equal(profile.known, true);
  assert.deepEqual(profile.requirements.map((entry) => entry.id), ["unit-tests", "responsive", "a11y"]);
  const result = evaluateQualityEvidence({ profile, verifications: [{ id: "unit-tests", status: "passed" }] });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing.map((entry) => entry.reason), ["UI_EVIDENCE_REQUIRED", "UI_EVIDENCE_REQUIRED"]);
});