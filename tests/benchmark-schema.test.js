const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Benchmark Schema Validation", () => {
  const { validateScenario, validateRunResult } = require("../benchmarks/harness/schema");

  describe("validateScenario", () => {
    it("should pass for valid scenario", () => {
      const scenario = {
        id: "test",
        name: "Test",
        type: "bug",
        prompt: "Fix the bug in the code that causes authentication to fail when the password is incorrect",
        fixtureDir: "_fixtures/test",
        hiddenTests: "test/hidden.test.js",
        validation: { command: "node --test", expectedExitCode: 0 },
      };

      const result = validateScenario(scenario);
      assert.equal(result.valid, true);
    });

    it("should fail for missing required fields", () => {
      const scenario = { id: "test" };
      const result = validateScenario(scenario);
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it("should fail for invalid type", () => {
      const scenario = {
        id: "test",
        name: "Test",
        type: "invalid",
        prompt: "Fix the bug",
        fixtureDir: "_fixtures/test",
        hiddenTests: "test/hidden.test.js",
        validation: { command: "node --test", expectedExitCode: 0 },
      };

      const result = validateScenario(scenario);
      assert.equal(result.valid, false);
    });
  });

  describe("validateRunResult", () => {
    it("should pass for valid result", () => {
      const result = {
        benchmark: "test",
        condition: "vanilla",
        run: 1,
        model: "test-model",
        driver: "test-driver",
        repoCommit: "abc123",
        promptHash: "hash123",
        environment: { os: "test", nodeVersion: "v20.0.0", platform: "linux", arch: "x64", timestamp: new Date().toISOString() },
        driverResult: { exitCode: 0, stdout: "", stderr: "", durationMs: 1000, filesChanged: [] },
        validation: { testsPassed: 5, testsTotal: 5, exitCode: 0, output: "ok" },
        evidence: { passed: true, testsPassed: 5, testsTotal: 5, errors: [], executionType: "real-execution", publicClaimEligible: true },
        metadata: { durationMs: 1000, retries: 0, notes: "" },
      };

      const validation = validateRunResult(result);
      assert.equal(validation.valid, true);
    });

    it("should fail for missing required fields", () => {
      const result = { benchmark: "test" };
      const validation = validateRunResult(result);
      assert.equal(validation.valid, false);
      assert.ok(validation.errors.length > 0);
    });
  });
});
