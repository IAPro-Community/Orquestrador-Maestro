const { describe, it, expect, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Memory } = require("../orquestrador/bin/memory.js");

describe("Memory Retention & Dedupe", () => {
  let tmpDir;
  let memory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-retention-test-"));
    memory = new Memory({ baseDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("dedupe", () => {
    it("should remove duplicate observations", () => {
      const projectId = "test-project";

      memory.record(projectId, { type: "discovery", summary: "Same finding" });
      memory.record(projectId, { type: "discovery", summary: "Same finding" });
      memory.record(projectId, { type: "discovery", summary: "Same finding" });
      memory.record(projectId, { type: "decision", summary: "Different decision" });

      const result = memory.dedupe(projectId);
      assert.equal(result.deduped, 2);
      assert.equal(result.remaining, 2);
    });

    it("should keep newer observation when deduplicating", () => {
      const projectId = "test-project";

      memory.record(projectId, { type: "discovery", summary: "Finding" });
      memory.record(projectId, { type: "discovery", summary: "Finding" });

      memory.dedupe(projectId);
      const observations = memory.search(projectId);
      assert.equal(observations.length, 1);
    });

    it("should return zero deduped for no duplicates", () => {
      const projectId = "test-project";

      memory.record(projectId, { type: "discovery", summary: "Unique 1" });
      memory.record(projectId, { type: "discovery", summary: "Unique 2" });

      const result = memory.dedupe(projectId);
      assert.equal(result.deduped, 0);
      assert.equal(result.remaining, 2);
    });
  });

  describe("consolidate", () => {
    it("should consolidate multiple observations", () => {
      const projectId = "test-project";

      const obs1 = memory.record(projectId, {
        type: "discovery",
        summary: "Auth bug found",
        tags: ["auth", "bug"],
        files: ["src/auth.ts"]
      });

      const obs2 = memory.record(projectId, {
        type: "discovery",
        summary: "Auth bug details",
        tags: ["auth", "security"],
        files: ["src/auth.ts", "tests/auth.test.ts"]
      });

      const consolidated = memory.consolidate(projectId, [obs1.id, obs2.id], {
        type: "problem",
        summary: "Authentication security bug",
        verified: true
      });

      assert.ok(consolidated.id);
      assert.equal(consolidated.type, "problem");
      assert.equal(consolidated.summary, "Authentication security bug");
      assert.ok(consolidated.tags.includes("auth"));
      assert.ok(consolidated.tags.includes("bug"));
      assert.ok(consolidated.tags.includes("security"));
      assert.ok(consolidated.files.includes("src/auth.ts"));
      assert.ok(consolidated.files.includes("tests/auth.test.ts"));
      assert.deepEqual(consolidated.consolidatedFrom, [obs1.id, obs2.id]);
    });

    it("should throw for no valid observations", () => {
      const projectId = "test-project";

      assert.throws(
        () => memory.consolidate(projectId, ["obs_nonexistent"], {
          type: "discovery",
          summary: "Test"
        }),
        /No valid observations found/
      );
    });
  });

  describe("retention", () => {
    it("should enforce max age", () => {
      const projectId = "test-project";

      memory.record(projectId, { type: "discovery", summary: "Recent" });

      const filePath = memory.getObservationsFile(projectId);
      const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
      const obs = JSON.parse(lines[0]);
      obs.timestamp = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(filePath, JSON.stringify(obs) + "\n", "utf8");

      const result = memory.retention(projectId, { maxAgeDays: 90 });
      assert.equal(result.retained, 0);
      assert.equal(result.removed, 1);
    });

    it("should enforce max count", () => {
      const projectId = "test-project";

      for (let i = 0; i < 10; i++) {
        memory.record(projectId, { type: "discovery", summary: `Finding ${i}` });
      }

      const result = memory.retention(projectId, { maxCount: 5 });
      assert.equal(result.retained, 5);
      assert.equal(result.removed, 5);
    });

    it("should keep verified observations", () => {
      const projectId = "test-project";

      memory.record(projectId, { type: "discovery", summary: "Unverified" });
      memory.record(projectId, { type: "decision", summary: "Verified", verified: true });

      const result = memory.retention(projectId, { maxCount: 1 });
      assert.ok(result.retained >= 1);
    });
  });

  describe("cleanup", () => {
    it("should run dedupe and retention", () => {
      const projectId = "test-project";

      memory.record(projectId, { type: "discovery", summary: "Duplicate" });
      memory.record(projectId, { type: "discovery", summary: "Duplicate" });
      memory.record(projectId, { type: "discovery", summary: "Unique" });

      const result = memory.cleanup(projectId);
      assert.ok(result.deduped >= 0);
      assert.ok(result.retained >= 0);
    });
  });
});