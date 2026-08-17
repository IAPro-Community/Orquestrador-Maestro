const { test } = require("node:test");
const assert = require("node:assert");
const { AiInterviewer } = require("../runtime/planner/ai-interviewer");

test("AiInterviewer should throw error and not swallow when provider execute fails", async () => {
  const mockProvider = {
    detect: async () => ({ installed: true }),
    execute: async () => {
      throw new Error("Simulated provider crash");
    }
  };

  const mockApp = {
    providers: {
      get: () => mockProvider
    },
    skills: {
      get: () => ({ instructions: "mock skill" })
    }
  };

  const interviewer = new AiInterviewer({
    resolvedSkills: [],
    preflightFacts: { workspacePath: "/tmp" },
    application: mockApp,
    intent: "test intent"
  });

  try {
    await interviewer.runInteractive();
    assert.fail("Should have thrown an error");
  } catch (e) {
    assert.strictEqual(e.message, "Simulated provider crash");
  }
});
