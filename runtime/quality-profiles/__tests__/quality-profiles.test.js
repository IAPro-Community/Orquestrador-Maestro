"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectQualityProfile, evaluateQualityEvidence, KNOWN_STACKS } = require("../index");

test("an unknown stack is blocking, never a permissive profile", () => {
  const profile = selectQualityProfile({ stack: "brainfuck" });
  assert.equal(profile.known, false);
  assert.equal(profile.requirements[0].reason, "UNKNOWN_STACK");
  const result = evaluateQualityEvidence({ profile, verifications: [{ id: "build", status: "passed" }] });
  assert.equal(result.complete, false);
  assert.equal(result.missing[0].reason, "UNKNOWN_STACK");
});

test("a green build alone never satisfies a functional requirement", () => {
  const profile = selectQualityProfile({ stack: "node" });
  const result = evaluateQualityEvidence({
    profile,
    verifications: [{ id: "build", status: "passed", kind: "build" }]
  });
  assert.equal(result.complete, false);
  assert.equal(result.buildOnly, true);
  assert.deepEqual(result.missing.map((item) => item.id), ["unit-tests"]);
});

test("functional verification satisfies the stack requirement", () => {
  const profile = selectQualityProfile({ stack: "node" });
  const result = evaluateQualityEvidence({ profile, verifications: [{ id: "unit-tests", status: "passed" }] });
  assert.equal(result.complete, true);
  assert.equal(result.buildOnly, false);
});

test("UI tasks require their own evidence for responsive and a11y", () => {
  const profile = selectQualityProfile({ stack: "node", ui: true });
  assert.deepEqual(profile.requirements.map((item) => item.id), ["unit-tests", "responsive", "a11y"]);

  const functionalOnly = evaluateQualityEvidence({ profile, verifications: [{ id: "unit-tests", status: "passed" }] });
  assert.equal(functionalOnly.complete, false);
  assert.deepEqual(functionalOnly.missing.map((item) => item.reason), ["UI_EVIDENCE_REQUIRED", "UI_EVIDENCE_REQUIRED"]);

  const withUi = evaluateQualityEvidence({
    profile,
    verifications: [{ id: "unit-tests", status: "passed" }],
    evidence: [{ requirementId: "responsive", status: "passed" }, { requirementId: "a11y", status: "passed" }]
  });
  assert.equal(withUi.complete, true);
});

test("failed or missing verifications never count, and evidence for another requirement does not leak", () => {
  const profile = selectQualityProfile({ stack: "node", ui: true });
  const result = evaluateQualityEvidence({
    profile,
    verifications: [{ id: "unit-tests", status: "failed" }],
    evidence: [{ requirementId: "unit-tests", status: "failed" }]
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing.map((item) => item.id), ["unit-tests", "responsive", "a11y"]);
});

test("operator extra requirements extend a known stack and are validated strictly", () => {
  const profile = selectQualityProfile({
    stack: "node",
    extraRequirements: [{ id: "visual-diff", kind: "ui", verifier: "npm run test:visual" }]
  });
  assert.deepEqual(profile.requirements.map((entry) => entry.id), ["unit-tests", "visual-diff"]);
  const result = evaluateQualityEvidence({
    profile,
    verifications: [{ id: "unit-tests", status: "passed" }],
    evidence: [{ requirementId: "visual-diff", status: "passed" }]
  });
  assert.equal(result.complete, true);

  assert.throws(() => selectQualityProfile({
    stack: "node", extraRequirements: [{ id: "visual-diff", kind: "ui" }]
  }), /requires a verifier command/u);
  assert.throws(() => selectQualityProfile({
    stack: "node", extraRequirements: [{ id: "unit-tests", kind: "functional", verifier: "x" }]
  }), /conflicts with an existing requirement/u);
  assert.throws(() => selectQualityProfile({
    stack: "node", extraRequirements: [{ id: "abc", kind: "blocking", verifier: "x" }]
  }), /invalid kind/u);
});

test("every known stack declares at least a functional verifier", () => {
  for (const stack of KNOWN_STACKS) {
    const profile = selectQualityProfile({ stack });
    assert.equal(profile.known, true, stack);
    assert.ok(profile.requirements.some((item) => item.kind === "functional"), `${stack} lacks a functional verifier`);
    assert.equal(profile.requirements.every((item) => item.kind === "blocking" || typeof item.verifier === "string"),
      true, `${stack} declares a requirement without a verifier`);
  }
});