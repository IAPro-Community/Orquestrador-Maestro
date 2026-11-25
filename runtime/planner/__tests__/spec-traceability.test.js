"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSpecTraceability, renderSpecBrief } = require("../spec-traceability");
const { PlanArtifactRenderer } = require("../plan-artifact-renderer");

const tasks = [{
  id: "task-ui-01",
  acceptanceCriteria: ["the note range is validated on submit", "invalid input is rejected with a typed error"]
}];

const verifiers = [
  { taskId: "task-ui-01", id: "npm test", command: "npm test", covers: ["the note range is validated on submit"] },
  { taskId: "task-ui-01", id: "typed errors", command: "grep -q 'typed' src/ui/errors.js", covers: ["invalid input is rejected with a typed error"] }
];

test("a criterion without an explicit verifier is unverified, never auto-covered", () => {
  const result = buildSpecTraceability({ tasks, verifiers: [verifiers[0]], sources: [] });
  assert.equal(result.totals.criteria, 2);
  assert.equal(result.totals.unverified, 1);
  assert.equal(result.complete, false);
  assert.deepEqual([...result.unverified], [{
    criterionId: "task-ui-01#2", taskId: "task-ui-01",
    criterion: "invalid input is rejected with a typed error"
  }]);
  const row = result.rows.find((item) => item.criterionId === "task-ui-01#2");
  assert.equal(row.verifier, null);
  assert.equal(row.status, "unverified");
});

test("a verifier covers a criterion only by explicit covers text, not by similarity", () => {
  // "similar" verifier (close text, no covers match) must NOT cover.
  const lookalike = { taskId: "task-ui-01", id: "npm test", command: "npm test", covers: ["the note range validated on submit "] };
  const result = buildSpecTraceability({ tasks, verifiers: [lookalike], sources: [] });
  assert.equal(result.totals.covered, 0);
  assert.equal(result.totals.unverified, 2);
  // Normalized whitespace/case matches exactly.
  const normalized = { taskId: "task-ui-01", id: "npm test", command: "npm test", covers: ["  THE NOTE RANGE  IS Validated  on submit "] };
  const exact = buildSpecTraceability({ tasks, verifiers: [normalized], sources: [] });
  assert.equal(exact.totals.covered, 1);
  assert.equal(exact.totals.unverified, 1);
});

test("coverage is anchored: wrong taskId or cross-task covers never count", () => {
  const foreign = { taskId: "task-other-02", id: "npm test", command: "npm test", covers: ["the note range is validated on submit"] };
  const result = buildSpecTraceability({ tasks, verifiers: [foreign], sources: [] });
  assert.equal(result.totals.covered, 0);
  assert.equal(result.totals.unverified, 2);
});

test("sources are projected only as safe relative paths with real digests", () => {
  const result = buildSpecTraceability({
    tasks, verifiers: [verifiers[0]],
    sources: [
      { path: "src/ui/form.jsx", role: "form", sourceDigest: "a".repeat(64) },
      { path: "/etc/passwd", role: "form", sourceDigest: "a".repeat(64) },
      { path: "../outside/secret.ts", role: "form", sourceDigest: "a".repeat(64) },
      { path: "src/ui/form.jsx", role: "form", sourceDigest: "not-a-digest" }
    ]
  });
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((row) => row.source?.path), ["src/ui/form.jsx", "src/ui/form.jsx"]);
  assert.equal(result.rows.every((row) => row.source.sourceDigest === "a".repeat(64)), true);
});

test("unverifiable and duplicate criteria are reported instead of silently merged", () => {
  const duplicated = [{
    id: "task-alpha-01", acceptanceCriteria: ["the note range is validated on submit"]
  }, {
    id: "task-beta-02", acceptanceCriteria: ["The note range is validated on submit"]
  }];
  const result = buildSpecTraceability({ tasks: duplicated, verifiers: [verifiers[0]], sources: [] });
  assert.equal(result.totals.criteria, 1);
  assert.equal(result.totals.duplicates, 1);
  assert.equal(result.complete, false);
  assert.deepEqual([...result.duplicates], [{
    criterion: "the note range is validated on submit",
    tasks: ["task-alpha-01", "task-beta-02"]
  }]);
  // The duplicate stays flagged even when both tasks declare a verifier: the
  // spec is reported as a smell, never silently merged into one task.
  const both = buildSpecTraceability({
    tasks: duplicated,
    verifiers: [
      { taskId: "task-alpha-01", id: "npm test", command: "npm test", covers: ["the note range is validated on submit"] },
      { taskId: "task-beta-02", id: "npm test", command: "npm test", covers: ["The note range is validated on submit"] }
    ],
    sources: []
  });
  assert.equal(both.totals.covered, 1);
  assert.equal(both.totals.duplicates, 1);
  assert.equal(both.complete, false);
});

test("the renderer is bounded and deterministic, and the plan artifact stays identical by default", () => {
  const result = buildSpecTraceability({ tasks, verifiers, sources: [] });
  assert.equal(renderSpecBrief(result), renderSpecBrief(result));
  assert.ok(renderSpecBrief(result, { maxChars: 200 }).endsWith("…"));

  const proposal = { tasks: [{ id: "task-ui-01", title: "UI step" }] };
  const baseline = PlanArtifactRenderer.render(proposal, {});
  assert.equal(baseline, PlanArtifactRenderer.render(proposal, {}));
  assert.ok(!baseline.includes("criterion"), "default artifact must stay untouched by the opt-in surface");

  const withSection = PlanArtifactRenderer.render(proposal, { specTraceability: result });
  assert.ok(withSection.length > baseline.length);
  assert.ok(withSection.includes("no verifier") || withSection.includes("npm test"),
    "the section must render the traceability, not a bare summary");
});
