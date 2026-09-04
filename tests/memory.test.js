const { describe, it, expect, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Memory } = require("../orquestrador/bin/memory.js");

describe("Memory", () => {
  let tmpDir;
  let memory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-test-"));
    memory = new Memory({ baseDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("generateId", () => {
    it("should generate valid observation ID", () => {
      const id = memory.generateId();
      assert.match(id, /^obs_[a-f0-9]{16}$/);
    });

    it("should generate unique IDs", () => {
      const id1 = memory.generateId();
      const id2 = memory.generateId();
      assert.notEqual(id1, id2);
    });
  });

  describe("record", () => {
    it("should record an observation", () => {
      const obs = memory.record("test-project", {
        type: "discovery",
        summary: "Found important pattern"
      });

      assert.ok(obs.id);
      assert.equal(obs.project, "test-project");
      assert.equal(obs.type, "discovery");
      assert.equal(obs.summary, "Found important pattern");
      assert.ok(obs.timestamp);
    });

    it("should save observation to JSONL file", () => {
      memory.record("test-project", {
        type: "discovery",
        summary: "Test observation"
      });

      const filePath = memory.getObservationsFile("test-project");
      assert.ok(fs.existsSync(filePath));

      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter(Boolean);
      assert.equal(lines.length, 1);

      const obs = JSON.parse(lines[0]);
      assert.equal(obs.type, "discovery");
    });

    it("should append multiple observations", () => {
      memory.record("test-project", { type: "discovery", summary: "First" });
      memory.record("test-project", { type: "decision", summary: "Second" });

      const filePath = memory.getObservationsFile("test-project");
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter(Boolean);
      assert.equal(lines.length, 2);
    });

    it("should redact secrets from summary", () => {
      const obs = memory.record("test-project", {
        type: "discovery",
        summary: "Found api_key=abc123secret"
      });

      assert.ok(obs.summary.includes("[REDACTED]"));
      assert.ok(!obs.summary.includes("abc123secret"));
    });

    it("should redact file paths", () => {
      const obs = memory.record("test-project", {
        type: "discovery",
        summary: "File at /home/user/secret.txt"
      });

      assert.ok(obs.summary.includes("[PATH_REDACTED]"));
    });
  });

  describe("search", () => {
    beforeEach(() => {
      memory.record("test-project", { type: "discovery", summary: "Auth bug found", tags: ["auth", "bug"] });
      memory.record("test-project", { type: "decision", summary: "Use JWT for auth", tags: ["auth", "decision"] });
      memory.record("test-project", { type: "implementation", summary: "Fixed login flow", tags: ["auth", "fix"] });
      memory.record("other-project", { type: "discovery", summary: "Other project finding", tags: ["other"] });
    });

    it("should return all observations for project", () => {
      const results = memory.search("test-project");
      assert.equal(results.length, 3);
    });

    it("should filter by type", () => {
      const results = memory.search("test-project", { type: "discovery" });
      assert.equal(results.length, 1);
      assert.equal(results[0].type, "discovery");
    });

    it("should filter by tags", () => {
      const results = memory.search("test-project", { tags: ["bug"] });
      assert.equal(results.length, 1);
      assert.ok(results[0].tags.includes("bug"));
    });

    it("should filter by search text", () => {
      const results = memory.search("test-project", { search: "JWT" });
      assert.equal(results.length, 1);
      assert.ok(results[0].summary.includes("JWT"));
    });

    it("should apply limit", () => {
      const results = memory.search("test-project", { limit: 2 });
      assert.equal(results.length, 2);
    });

    it("should return empty for non-existent project", () => {
      const results = memory.search("non-existent");
      assert.equal(results.length, 0);
    });

    it("should sort by timestamp descending", () => {
      const results = memory.search("test-project");
      for (let i = 1; i < results.length; i++) {
        assert.ok(new Date(results[i - 1].timestamp) >= new Date(results[i].timestamp));
      }
    });
  });

  describe("show", () => {
    it("should return observation by ID", () => {
      const recorded = memory.record("test-project", {
        type: "discovery",
        summary: "Test observation"
      });

      const found = memory.show("test-project", recorded.id);
      assert.ok(found);
      assert.equal(found.id, recorded.id);
      assert.equal(found.summary, "Test observation");
    });

    it("should return null for non-existent ID", () => {
      const found = memory.show("test-project", "obs_nonexistent");
      assert.equal(found, null);
    });

    it("should return null for non-existent project", () => {
      const found = memory.show("non-existent", "obs_1234567890abcdef");
      assert.equal(found, null);
    });
  });

  describe("timeline", () => {
    it("should return timeline of observations", () => {
      memory.record("test-project", { type: "discovery", summary: "First" });
      memory.record("test-project", { type: "decision", summary: "Second" });

      const timeline = memory.timeline("test-project");
      assert.equal(timeline.length, 2);
      assert.ok(timeline[0].id);
      assert.ok(timeline[0].timestamp);
      assert.ok(timeline[0].type);
      assert.ok(timeline[0].summary);
    });

    it("should apply limit", () => {
      memory.record("test-project", { type: "discovery", summary: "First" });
      memory.record("test-project", { type: "decision", summary: "Second" });
      memory.record("test-project", { type: "implementation", summary: "Third" });

      const timeline = memory.timeline("test-project", { limit: 2 });
      assert.equal(timeline.length, 2);
    });
  });

  describe("promote", () => {
    it("should promote verified observation", () => {
      const recorded = memory.record("test-project", {
        type: "decision",
        summary: "Use TypeScript",
        verified: true
      });

      const result = memory.promote("test-project", recorded.id, "DEV/DECISIONS.md", { apply: true, projectRoot: tmpDir });
      assert.equal(result.status, "promoted");
      assert.equal(result.destination, "DEV/DECISIONS.md");
      assert.ok(result.promotedAt);
    });

    it("should reject unverified observation", () => {
      const recorded = memory.record("test-project", {
        type: "decision",
        summary: "Use TypeScript",
        verified: false
      });

      assert.throws(
        () => memory.promote("test-project", recorded.id, "DEV/DECISIONS.md"),
        /Cannot promote unverified observation/
      );
    });

    it("should throw for non-existent observation", () => {
      assert.throws(
        () => memory.promote("test-project", "obs_nonexistent", "DEV/DECISIONS.md"),
        /Observation not found/
      );
    });
  });

  describe("stats", () => {
    it("should return stats for project", () => {
      memory.record("test-project", { type: "discovery", summary: "First", verified: true });
      memory.record("test-project", { type: "decision", summary: "Second", verified: false });

      const stats = memory.stats("test-project");
      assert.equal(stats.total, 2);
      assert.equal(stats.verified, 1);
      assert.equal(stats.unverified, 1);
      assert.deepEqual(stats.byType, { discovery: 1, decision: 1 });
    });

    it("should return zero stats for empty project", () => {
      const stats = memory.stats("empty-project");
      assert.equal(stats.total, 0);
      assert.equal(stats.verified, 0);
    });
  });

  describe("listProjects", () => {
    it("should list projects with observations", () => {
      memory.record("project-a", { type: "discovery", summary: "A" });
      memory.record("project-b", { type: "discovery", summary: "B" });

      const projects = memory.listProjects();
      assert.ok(projects.includes("project-a"));
      assert.ok(projects.includes("project-b"));
    });

    it("should return empty for no projects", () => {
      const projects = memory.listProjects();
      assert.equal(projects.length, 0);
    });
  });

  describe("prune", () => {
    it("should prune observations keeping recent", () => {
      for (let i = 0; i < 10; i++) {
        memory.record("test-project", { type: "discovery", summary: `Observation ${i}` });
      }

      const result = memory.prune("test-project", { keepRecent: 5 });
      assert.equal(result.remaining, 5);
      assert.equal(result.pruned, 5);
    });

    it("should keep verified observations", () => {
      memory.record("test-project", { type: "discovery", summary: "Unverified 1" });
      memory.record("test-project", { type: "decision", summary: "Verified", verified: true });
      memory.record("test-project", { type: "discovery", summary: "Unverified 2" });

      const result = memory.prune("test-project", { keepRecent: 1 });
      assert.ok(result.remaining >= 1);
    });
  });

  describe("validateObservation", () => {
    it("should accept valid observation", () => {
      const obs = {
        schemaVersion: 1,
        id: "obs_1234567890abcdef",
        timestamp: new Date().toISOString(),
        project: "test",
        type: "discovery",
        summary: "Test",
        scope: { level: "branch", repositoryId: "repo-1", branch: "main" }
      };
      assert.ok(memory.validateObservation(obs));
    });

    it("should reject invalid schema version", () => {
      const obs = {
        schemaVersion: 2,
        id: "obs_1234567890abcdef",
        timestamp: new Date().toISOString(),
        project: "test",
        type: "discovery",
        summary: "Test"
      };
      assert.throws(() => memory.validateObservation(obs), /Invalid schemaVersion/);
    });

    it("should reject invalid ID format", () => {
      const obs = {
        schemaVersion: 1,
        id: "invalid-id",
        timestamp: new Date().toISOString(),
        project: "test",
        type: "discovery",
        summary: "Test"
      };
      assert.throws(() => memory.validateObservation(obs), /Invalid observation ID/);
    });

    it("should reject invalid type", () => {
      const obs = {
        schemaVersion: 1,
        id: "obs_1234567890abcdef",
        timestamp: new Date().toISOString(),
        project: "test",
        type: "invalid",
        summary: "Test"
      };
      assert.throws(() => memory.validateObservation(obs), /Invalid observation type/);
    });

    it("should reject observation without scope", () => {
      const obs = {
        schemaVersion: 1,
        id: "obs_1234567890abcdef",
        timestamp: new Date().toISOString(),
        project: "test",
        type: "discovery",
        summary: "Test"
      };
      assert.throws(() => memory.validateObservation(obs), /Invalid observation scope/);
    });

    it("should reject observation with invalid scope level", () => {
      const obs = {
        schemaVersion: 1,
        id: "obs_1234567890abcdef",
        timestamp: new Date().toISOString(),
        project: "test",
        type: "discovery",
        summary: "Test",
        scope: { level: "branch" }
      };
      assert.throws(() => memory.validateObservation(obs), /Invalid observation scope/);
    });
  });
});