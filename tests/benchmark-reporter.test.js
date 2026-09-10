const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Benchmark Reporter", () => {
  const { generateMarkdownReport, generateJsonReport } = require("../benchmarks/harness/reporter");

  const sampleResults = [
    {
      benchmark: "test-scenario",
      condition: "vanilla",
      run: 1,
      model: "test-model",
      driver: "test-driver",
      evidence: { passed: true, testsPassed: 5, testsTotal: 5, errors: [] },
      driverResult: { exitCode: 0, stdout: "", stderr: "", durationMs: 5000, filesChanged: [] },
      validation: { testsPassed: 5, testsTotal: 5, exitCode: 0, output: "ok" },
      metadata: { durationMs: 5000, retries: 0, notes: "" },
    },
    {
      benchmark: "test-scenario",
      condition: "maestro-core",
      run: 1,
      model: "test-model",
      driver: "test-driver",
      evidence: { passed: true, testsPassed: 5, testsTotal: 5, errors: [] },
      driverResult: { exitCode: 0, stdout: "", stderr: "", durationMs: 4000, filesChanged: [] },
      validation: { testsPassed: 5, testsTotal: 5, exitCode: 0, output: "ok" },
      metadata: { durationMs: 4000, retries: 0, notes: "" },
    },
  ];

  const sampleComparisons = [
    {
      scenarioId: "test-scenario",
      vanilla: {
        n: 1,
        successRate: 1,
        tokens: { median: null, mean: null, p50: null, p95: null, min: null, max: null, ci95: { lower: null, upper: null }, stddev: null },
        duration: { median: 5000, mean: 5000, p50: 5000, p95: 5000, min: 5000, max: 5000, ci95: { lower: 5000, upper: 5000 }, stddev: null },
      },
      maestro: {
        n: 1,
        successRate: 1,
        tokens: { median: null, mean: null, p50: null, p95: null, min: null, max: null, ci95: { lower: null, upper: null }, stddev: null },
        duration: { median: 4000, mean: 4000, p50: 4000, p95: 4000, min: 4000, max: 4000, ci95: { lower: 4000, upper: 4000 }, stddev: null },
      },
      delta: { tokensMedianDelta: null, tokensMedianPctChange: null, durationMedianDelta: -1000, durationMedianPctChange: -20, successRateDelta: 0 },
      note: "Insufficient runs for statistical significance (need >=3 per condition)",
    },
  ];

  describe("generateMarkdownReport", () => {
    it("should generate markdown report", () => {
      const report = generateMarkdownReport(sampleResults, sampleComparisons, {});
      assert.ok(typeof report === "string");
      assert.ok(report.includes("test-scenario"));
      assert.ok(report.includes("vanilla"));
      assert.ok(report.includes("maestro-core"));
    });

    it("should include comparison table", () => {
      const report = generateMarkdownReport(sampleResults, sampleComparisons, {});
      assert.ok(report.includes("Comparison") || report.includes("comparison"));
    });
  });

  describe("generateJsonReport", () => {
    it("should generate valid JSON", () => {
      const report = generateJsonReport(sampleResults, sampleComparisons, {});
      const parsed = JSON.parse(report);
      assert.ok(parsed.results);
      assert.ok(parsed.comparisons);
      assert.ok(parsed.summary);
    });

    it("should include metadata", () => {
      const report = generateJsonReport(sampleResults, sampleComparisons, {});
      const parsed = JSON.parse(report);
      assert.ok(parsed.metadata);
      assert.ok(parsed.metadata.generatedAt);
    });
  });
});
