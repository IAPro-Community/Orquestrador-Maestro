const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

describe("Benchmark Harness Orchestrator", () => {
  const {
    loadScenario,
    listScenarios,
    setupWorkspace,
    cleanupWorkspace,
    saveResult,
    calculatePromptHash,
    getEnvironment,
    getRepoCommit,
  } = require("../benchmarks/harness/index");

  describe("listScenarios", () => {
    it("should list available scenarios", () => {
      const scenarios = listScenarios();
      assert.ok(Array.isArray(scenarios));
      assert.ok(scenarios.length > 0);
      assert.ok(scenarios.includes("bug-fix-auth"));
    });
  });

  describe("loadScenario", () => {
    it("should load a scenario by ID", () => {
      const scenario = loadScenario("bug-fix-auth");
      assert.equal(scenario.id, "bug-fix-auth");
      assert.ok(scenario.name);
      assert.ok(scenario.prompt);
      assert.ok(scenario.fixtureDir);
    });

    it("should throw for non-existent scenario", () => {
      assert.throws(() => loadScenario("nonexistent"), /not found/i);
    });
  });

  describe("calculatePromptHash", () => {
    it("should return a hash string", () => {
      const hash = calculatePromptHash("test prompt");
      assert.ok(typeof hash === "string");
      assert.ok(hash.length === 64); // SHA-256 hex
    });

    it("should be deterministic", () => {
      const hash1 = calculatePromptHash("test prompt");
      const hash2 = calculatePromptHash("test prompt");
      assert.equal(hash1, hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = calculatePromptHash("prompt 1");
      const hash2 = calculatePromptHash("prompt 2");
      assert.notEqual(hash1, hash2);
    });
  });

  describe("getEnvironment", () => {
    it("should return environment info", () => {
      const env = getEnvironment();
      assert.ok(env.os);
      assert.ok(env.nodeVersion);
      assert.ok(env.platform);
      assert.ok(env.arch);
      assert.ok(env.timestamp);
    });
  });

  describe("getRepoCommit", () => {
    it("should return commit hash or unknown", () => {
      const commit = getRepoCommit();
      assert.ok(typeof commit === "string");
      assert.ok(commit.length > 0);
    });
  });

  describe("setupWorkspace", () => {
    it("should copy fixture to temp directory", () => {
      const scenario = loadScenario("bug-fix-auth");
      const tmpDir = setupWorkspace(scenario);

      assert.ok(fs.existsSync(tmpDir));
      assert.ok(fs.existsSync(path.join(tmpDir, "src", "TokenService.js")));

      cleanupWorkspace(tmpDir);
    });

    it("should throw for non-existent fixture", () => {
      const scenario = { fixtureDir: "_fixtures/nonexistent" };
      assert.throws(() => setupWorkspace(scenario), /not found/i);
    });
  });

  describe("saveResult", () => {
    it("should save result to output directory", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-test-"));
      const result = {
        benchmark: "test",
        condition: "vanilla",
        run: 1,
        model: "test",
        driver: "test",
        repoCommit: "abc",
        promptHash: "hash",
        environment: {},
        driverResult: {},
        validation: {},
        evidence: {},
        metadata: {},
      };

      const filepath = saveResult(result, tmpDir);
      assert.ok(fs.existsSync(filepath));
      assert.ok(filepath.includes("test_vanilla_run1.json"));

      cleanupWorkspace(tmpDir);
    });
  });
});
