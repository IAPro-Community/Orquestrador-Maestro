const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Benchmark Evidence Gate", () => {
  const { evaluateEvidence, summarizeEvidence } = require("../benchmarks/harness/evidence");

  describe("evaluateEvidence", () => {
    it("should pass when tests pass and exit code matches", () => {
      const driverResult = { exitCode: 0, stdout: "All tests passed", stderr: "" };
      const validation = { testsPassed: 5, testsTotal: 5, exitCode: 0, output: "ok" };

      const result = evaluateEvidence(driverResult, validation, { expectedExitCode: 0 });
      assert.equal(result.passed, true);
      assert.equal(result.testsPassed, 5);
      assert.equal(result.testsTotal, 5);
    });

    it("should fail when tests fail", () => {
      const driverResult = { exitCode: 0, stdout: "", stderr: "" };
      const validation = { testsPassed: 3, testsTotal: 5, exitCode: 1, output: "2 failed" };

      const result = evaluateEvidence(driverResult, validation, { expectedExitCode: 0 });
      assert.equal(result.passed, false);
    });

    it("should fail when exit code doesn't match", () => {
      const driverResult = { exitCode: 1, stdout: "", stderr: "Error" };
      const validation = { testsPassed: 5, testsTotal: 5, exitCode: 0, output: "ok" };

      const result = evaluateEvidence(driverResult, validation, { expectedExitCode: 0 });
      assert.equal(result.passed, false);
    });

    it("should include error details when failing", () => {
      const driverResult = { exitCode: 1, stdout: "", stderr: "Syntax error" };
      const validation = { testsPassed: 0, testsTotal: 3, exitCode: 1, output: "3 failed" };

      const result = evaluateEvidence(driverResult, validation, { expectedExitCode: 0 });
      assert.ok(result.errors.length > 0);
    });
  });

  describe("summarizeEvidence", () => {
    it("should summarize results correctly", () => {
      const results = [
        { benchmark: "test1", condition: "vanilla", evidence: { passed: true, publicClaimEligible: true, executionType: "real-execution", reproducible: true, isolated: true }, usage: { tokenSource: "provider-reported" }, validation: { passed: true } },
        { benchmark: "test1", condition: "maestro-core", evidence: { passed: true, publicClaimEligible: true, executionType: "real-execution", reproducible: true, isolated: true }, usage: { tokenSource: "provider-reported" }, validation: { passed: true } },
        { benchmark: "test2", condition: "vanilla", evidence: { passed: false, publicClaimEligible: false, executionType: "synthetic" }, usage: { tokenSource: "unknown" }, validation: { passed: false } },
        { benchmark: "test2", condition: "maestro-core", evidence: { passed: true, publicClaimEligible: true, executionType: "real-execution", reproducible: true, isolated: true }, usage: { tokenSource: "provider-reported" }, validation: { passed: true } },
      ];

      const summary = summarizeEvidence(results);
      assert.equal(summary.totalRuns, 4);
      assert.equal(summary.claimEligibleRuns, 3);
      assert.equal(summary.hasMixedEvidence, true);
      assert.equal(summary.publicClaimEligible, false);
    });
  });
});
