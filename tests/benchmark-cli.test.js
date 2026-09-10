const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Benchmark CLI", () => {
  const { parseArgs, printHelp } = require("../benchmarks/cli");

  describe("parseArgs", () => {
    it("should parse model argument", () => {
      const args = parseArgs(["--model", "anthropic/claude-sonnet-4-20250514"]);
      assert.equal(args.model, "anthropic/claude-sonnet-4-20250514");
    });

    it("should parse runs argument", () => {
      const args = parseArgs(["--runs", "5"]);
      assert.equal(args.runs, 5);
    });

    it("should parse conditions argument", () => {
      const args = parseArgs(["--conditions", "vanilla,maestro-core"]);
      assert.deepEqual(args.conditions, ["vanilla", "maestro-core"]);
    });

    it("should parse scenario IDs", () => {
      const args = parseArgs(["bug-fix-auth", "feature-add-button"]);
      assert.deepEqual(args.scenarios, ["bug-fix-auth", "feature-add-button"]);
    });

    it("should parse verbose flag", () => {
      const args = parseArgs(["--verbose"]);
      assert.equal(args.verbose, true);
    });

    it("should parse help flag", () => {
      const args = parseArgs(["--help"]);
      assert.equal(args.help, true);
    });

    it("should parse mixed arguments", () => {
      const args = parseArgs([
        "bug-fix-auth",
        "--model", "test-model",
        "--runs", "3",
        "--verbose",
      ]);
      assert.deepEqual(args.scenarios, ["bug-fix-auth"]);
      assert.equal(args.model, "test-model");
      assert.equal(args.runs, 3);
      assert.equal(args.verbose, true);
    });

    it("should parse timeout argument", () => {
      const args = parseArgs(["--timeout", "180000"]);
      assert.equal(args.timeoutMs, 180000);
    });

    it("should parse output directory", () => {
      const args = parseArgs(["--output", "/tmp/results"]);
      assert.equal(args.outputDir, "/tmp/results");
    });

    it("should parse driver argument", () => {
      const args = parseArgs(["--driver", "opencode"]);
      assert.equal(args.driver, "opencode");
    });

    it("validates all scenarios when no scenario id is supplied", () => {
      const { cmdValidate } = require("../benchmarks/cli");
      assert.doesNotThrow(() => cmdValidate());
    });
  });

  describe("printHelp", () => {
    it("should not throw", () => {
      assert.doesNotThrow(() => printHelp());
    });
  });
});
