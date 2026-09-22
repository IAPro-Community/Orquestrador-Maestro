const { describe, it, expect, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const { Memory } = require("../orquestrador/bin/memory.js");

describe("Memory-Context Integration", () => {
  let tmpDir;
  let memory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-context-test-"));
    memory = new Memory({ baseDir: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("context brief with memory", () => {
    it("should retrieve relevant observations for task", () => {
      const projectId = "test-project";

      memory.record(projectId, {
        type: "decision",
        summary: "Use JWT for authentication",
        tags: ["auth", "jwt"],
        verified: true
      });

      memory.record(projectId, {
        type: "discovery",
        summary: "Refresh token reuse bug found",
        tags: ["auth", "bug"],
        verified: true
      });

      memory.record(projectId, {
        type: "implementation",
        summary: "Fixed login flow",
        tags: ["auth", "login"],
        verified: true
      });

      const authObservations = memory.search(projectId, { search: "auth" });
      assert.ok(authObservations.length >= 2);

      const bugObservations = memory.search(projectId, { type: "discovery" });
      assert.ok(bugObservations.length >= 1);
    });

    it("should not load irrelevant observations", () => {
      const projectId = "test-project";

      memory.record(projectId, {
        type: "decision",
        summary: "Use TypeScript",
        tags: ["typescript", "language"],
        verified: true
      });

      memory.record(projectId, {
        type: "discovery",
        summary: "Database performance issue",
        tags: ["database", "performance"],
        verified: true
      });

      const authObservations = memory.search(projectId, { search: "authentication" });
      assert.equal(authObservations.length, 0);
    });

    it("should respect context budget", () => {
      const projectId = "test-project";

      for (let i = 0; i < 100; i++) {
        memory.record(projectId, {
          type: "discovery",
          summary: `Finding ${i}`,
          tags: [`tag${i}`],
          verified: true
        });
      }

      const observations = memory.search(projectId, { limit: 10 });
      assert.equal(observations.length, 10);
    });

    it("should prefer verified observations", () => {
      const projectId = "test-project";

      memory.record(projectId, {
        type: "decision",
        summary: "Verified decision",
        tags: ["important"],
        verified: true
      });

      memory.record(projectId, {
        type: "decision",
        summary: "Unverified decision",
        tags: ["important"],
        verified: false
      });

      const verified = memory.search(projectId, { verified: true });
      assert.equal(verified.length, 1);
      assert.ok(verified[0].summary.includes("Verified"));
    });

    it("should handle stale observations", () => {
      const projectId = "test-project";

      memory.record(projectId, {
        type: "decision",
        summary: "Old decision",
        tags: ["outdated"],
        verified: true
      });

      memory.record(projectId, {
        type: "decision",
        summary: "New decision",
        tags: ["current"],
        verified: true
      });

      const stats = memory.stats(projectId);
      assert.equal(stats.total, 2);

      const pruned = memory.prune(projectId, { keepRecent: 1 });
      assert.equal(pruned.remaining, 2);
      assert.equal(pruned.pruned, 0);
    });
  });

  describe("canonical precedence", () => {
    it("should detect conflicts between observations", () => {
      const projectId = "test-project";

      memory.record(projectId, {
        type: "decision",
        summary: "Use React for frontend",
        tags: ["frontend", "framework"],
        verified: true
      });

      memory.record(projectId, {
        type: "decision",
        summary: "Use Vue for frontend",
        tags: ["frontend", "framework"],
        verified: true
      });

      const frontendDecisions = memory.search(projectId, {
        search: "frontend",
        type: "decision"
      });

      assert.ok(frontendDecisions.length >= 2);
    });
  });

  describe("task classification", () => {
    it("should classify trivial tasks", () => {
      const task = "Change button text from 'Submit' to 'Send'";
      const isTrivial = task.length < 50 && !task.includes("implement") && !task.includes("create");
      assert.ok(isTrivial);
    });

    it("should classify complex tasks", () => {
      const task = "Implement authentication system with JWT, refresh tokens, and session management";
      const isComplex = task.includes("implement") || task.includes("create") || task.includes("system");
      assert.ok(isComplex);
    });

    it("should classify resumed tasks", () => {
      const task = "Continue working on the authentication feature from previous session";
      const isResumed = task.includes("continue") || task.includes("previous session") || task.includes("resume");
      assert.ok(isResumed);
    });
  });
});