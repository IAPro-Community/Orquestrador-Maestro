"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { mergeConfig, loadGovernanceConfig, writeGovernanceConfig, buildGovernance } = require("../runtime/governance/compatibility");

test("compatibility is additive and warns once for skipped verification", () => {
  const config = mergeConfig();
  assert.equal(config.mode, "compatibility");
  const sessionWarnings = new Set();
  const first = buildGovernance({ config, task: { acceptanceCriteria: ["the command passes"] }, verification: { status: "skipped" }, sessionWarnings });
  const second = buildGovernance({ config, task: { acceptanceCriteria: ["the command passes"] }, verification: { status: "skipped" }, sessionWarnings });
  assert.equal(first.warnings.length, 1);
  assert.equal(second.warnings.length, 0);
  assert.equal(first.recommendations.length, 1);
});

test("invalid configuration falls back to safe compatibility defaults", () => {
  const config = mergeConfig({ mode: "unknown", tone: "rewritten", warningFrequency: "unknown", checks: { missingVerification: "block" }, hooks: { enabled: "yes" } });
  assert.equal(config.mode, "compatibility");
  assert.equal(config.tone, "preserved");
  assert.equal(config.warningFrequency, "once-per-session");
  assert.equal(config.checks.missingVerification, "block");
  assert.equal(config.hooks.enabled, false);
  assert.equal(config.features.independentReview, false);
});

test("evidence recommendation is relevant only when acceptance criteria exist", () => {
  const withoutCriteria = buildGovernance({ verification: { status: "passed" }, evidence: [] });
  assert.deepEqual(withoutCriteria.recommendations, []);
  const withCriteria = buildGovernance({ task: { acceptanceCriteria: ["the command passes"] }, verification: { status: "passed" }, evidence: [] });
  assert.equal(withCriteria.recommendations[0].code, "evidence.missing");
});

test("explicit blocking checks are available without changing the conservative default", () => {
  const result = buildGovernance({ config: { checks: { missingVerification: "block" } }, verification: { status: "skipped" } });
  assert.equal(result.blocking[0].code, "verification.required");
  assert.deepEqual(buildGovernance({ verification: { status: "skipped" } }).blocking, []);
});

test("configuration writes to the canonical project file and preserves legacy runtime files", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-governance-config-"));
  fs.mkdirSync(path.join(project, ".orquestrador", "runtime"), { recursive: true });
  const result = writeGovernanceConfig({ cwd: project, patch: { mode: "strict" } });
  assert.equal(result.path, path.join(project, ".orquestrador-maestro", "config.json"));
  assert.equal(loadGovernanceConfig({ cwd: project }).config.mode, "strict");
  assert.equal(fs.existsSync(path.join(project, ".orquestrador", "runtime")), true);
  fs.rmSync(project, { recursive: true, force: true });
});

test("strict mode is explicit and preserves native tone/provider controls", () => {
  const config = mergeConfig({ mode: "strict", tone: "preserved", hooks: { enabled: false } });
  assert.equal(config.mode, "strict");
  assert.equal(config.tone, "preserved");
  assert.equal(config.hooks.enabled, false);
  assert.equal(config.providerModel, "informational");
});

test("invalid cognitive budget configuration fails fast", () => {
  assert.throws(() => mergeConfig({ cognitiveBudget: { lean: { maxSkills: 0 } } }), /Invalid cognitiveBudget/);
  assert.throws(() => mergeConfig({ cognitiveBudget: { unknown: {} } }), /unknown cognitive budget tier/);
});
