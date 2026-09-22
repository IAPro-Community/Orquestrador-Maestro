"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SemanticPlanner } = require("../runtime/planner/semantic-planner");

class MockApp {
  constructor(providerResult = null, { error = null, installed = true } = {}) {
    this.executeCalls = [];
    this.providers = {
      get: (id) => ({
        detect: async () => ({ installed }),
        execute: async (opts) => {
          this.executeCalls.push({ id, ...opts });
          if (error) {
            if (typeof error === "function") {
              return error(this.executeCalls.length, opts);
            }
            throw error;
          }
          const stdout = typeof providerResult === "function" ? providerResult(this.executeCalls.length, opts) : providerResult;
          return {
            providerId: id,
            pid: 1,
            result: Promise.resolve({
              providerId: id,
              pid: 1,
              stdout,
              stderr: "",
              cancelled: false,
              timedOut: false,
              durationMs: 1,
              exitCode: 0,
              signal: null,
              error: undefined
            }),
            cancel() {}
          };
        }
      })
    };
  }
}

test("SemanticPlanner throws MISSING_MISSION_ID if missionId is not provided", async () => {
  const planner = new SemanticPlanner({
    application: new MockApp("{}"),
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true }
  });

  await assert.rejects(
    () => planner.plan({
      missionBrief: { objective: "CRUD products" },
      taskRelevantContext: { items: [] }
    }),
    /MISSING_MISSION_ID/
  );
});

test("SemanticPlanner accepts missionBrief.id when missionId argument is omitted", async () => {
  const validJson = JSON.stringify({
    tasks: [
      { id: "t1", title: "Analyze Codebase", objective: "Read patterns", type: "analyze", dependsOn: [] },
      { id: "t2", title: "Build Repository", objective: "Create data layer", type: "persistence", dependsOn: ["t1"] }
    ],
    assumptions: [],
    rationale: "Clean separation"
  });

  const app = new MockApp(validJson);
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true }
  });

  const res = await planner.plan({
    missionBrief: { id: "mission-brief-id-123", objective: "CRUD products", requirements: [] },
    taskRelevantContext: { items: [] }
  });

  assert.equal(res.planningMode, "local-ai");
  assert.equal(res.taskGraph.missionId, "mission-brief-id-123");
});

test("SemanticPlanner enforces localOnly policy rejecting remote provider", async () => {
  const planner = new SemanticPlanner({
    application: new MockApp("{}"),
    plannerTarget: { providerId: "claude", model: "sonnet", local: false },
    localOnly: true
  });

  await assert.rejects(
    () => planner.plan({
      missionBrief: { id: "m1", objective: "CRUD products" },
      missionId: "m1",
      taskRelevantContext: { items: [] }
    }),
    /LOCAL_ONLY_VIOLATION/
  );
});

test("SemanticPlanner allows remote provider when localOnly is false", async () => {
  const validJson = JSON.stringify({
    tasks: [
      { id: "t1", title: "Analyze Codebase", objective: "Read patterns", type: "analyze", dependsOn: [] }
    ],
    assumptions: [],
    rationale: "Remote execution"
  });

  const app = new MockApp(validJson);
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "claude", model: "sonnet", local: false },
    localOnly: false
  });

  const res = await planner.plan({
    missionBrief: { id: "m1", objective: "CRUD products", requirements: [] },
    missionId: "m1",
    taskRelevantContext: { items: [] }
  });

  assert.equal(res.planningMode, "local-ai");
  assert.equal(res.taskGraph.missionId, "m1");
});

test("SemanticPlanner passes explicit model from plannerTarget to provider.execute", async () => {
  const validJson = JSON.stringify({
    tasks: [
      { id: "t1", title: "Analyze Codebase", objective: "Read patterns", type: "analyze", dependsOn: [] },
      { id: "t2", title: "Build Repository", objective: "Create data layer", type: "persistence", dependsOn: ["t1"] }
    ],
    assumptions: [],
    rationale: "Clean separation"
  });

  const app = new MockApp(validJson);
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "deepseek-local", local: true }
  });

  const res = await planner.plan({
    missionBrief: { id: "m1", objective: "CRUD products", requirements: [] },
    missionId: "m1",
    taskRelevantContext: { items: [] }
  });

  assert.equal(app.executeCalls.length, 1);
  assert.equal(app.executeCalls[0].model, "deepseek-local");
  assert.equal(res.planningMode, "local-ai");
  assert.equal(res.taskGraph.missionId, "m1");
  assert.equal(res.taskGraph.tasks.length, 2);
});

test("SemanticPlanner returns validated TaskGraph on valid AI response", async () => {
  const validJson = JSON.stringify({
    tasks: [
      {
        id: "task-1",
        title: "Analyze architectural conventions",
        objective: "Read codebase patterns",
        type: "analyze",
        dependsOn: [],
        acceptanceCriteria: ["Conventions documented"],
        requiredCapabilities: ["backend", "architecture"],
        complexity: "simple",
        risk: "low"
      },
      {
        id: "task-2",
        title: "Implement Domain and Persistence",
        objective: "Create product entity and storage layer",
        type: "persistence",
        dependsOn: ["task-1"],
        acceptanceCriteria: ["Entities and repository created"],
        requiredCapabilities: ["backend", "database"],
        complexity: "medium",
        risk: "low"
      }
    ],
    assumptions: [{ text: "Database SQLite is available", critical: false }],
    rationale: "Sequential architecture implementation"
  });

  const app = new MockApp(validJson);
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true }
  });

  const res = await planner.plan({
    missionBrief: { id: "mission-99", objective: "Implement Product Catalog", requirements: ["Store products"] },
    missionId: "mission-99",
    taskRelevantContext: { items: [] }
  });

  assert.equal(res.planningMode, "local-ai");
  assert.equal(res.taskGraph.kind, "task_graph");
  assert.equal(res.taskGraph.missionId, "mission-99");
  assert.equal(res.taskGraph.tasks.length, 2);
  assert.equal(res.taskGraph.tasks[0].id, "task-1");
  assert.equal(res.taskGraph.tasks[1].id, "task-2");
  assert.deepEqual(res.taskGraph.dependencies, { "task-1": [], "task-2": ["task-1"] });
  assert.equal(res.proposal.tasks.length, 2);
  assert.equal(res.proposal.planningMode, "local-ai");
});

test("SemanticPlanner retries on malformed JSON and throws STRUCTURED_OUTPUT_FAILED on exhausted retries when allowFallback is false", async () => {
  const app = new MockApp("Invalid JSON output that cannot be parsed");
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true },
    maxRetries: 3
  });

  await assert.rejects(
    () => planner.plan({
      missionBrief: { id: "m1", objective: "CRUD products", requirements: [] },
      missionId: "m1",
      taskRelevantContext: { items: [] },
      allowFallback: false
    }),
    /STRUCTURED_OUTPUT_FAILED/
  );

  assert.equal(app.executeCalls.length, 3);
});

test("SemanticPlanner succeeds on retry if subsequent attempt returns valid JSON", async () => {
  let attempt = 0;
  const app = new MockApp(() => {
    attempt++;
    if (attempt < 2) {
      return "Malformed non-JSON output";
    }
    return JSON.stringify({
      tasks: [
        { id: "t1", title: "Analyze Codebase", objective: "Read patterns", type: "analyze", dependsOn: [] }
      ],
      assumptions: [],
      rationale: "Recovered on attempt 2"
    });
  });

  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true },
    maxRetries: 3
  });

  const res = await planner.plan({
    missionBrief: { id: "m1", objective: "CRUD products", requirements: [] },
    missionId: "m1",
    taskRelevantContext: { items: [] },
    allowFallback: false
  });

  assert.equal(attempt, 2);
  assert.equal(res.planningMode, "local-ai");
  assert.equal(res.taskGraph.tasks.length, 1);
});

test("SemanticPlanner uses fallback when provider is unavailable and allowFallback is true", async () => {
  const app = new MockApp("{}", { installed: false });
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true }
  });

  const res = await planner.plan({
    missionBrief: { id: "m-fallback", objective: "Write developer setup documentation", requirements: ["Document prerequisites"] },
    missionId: "m-fallback",
    taskRelevantContext: { items: [] },
    allowFallback: true
  });

  assert.equal(res.planningMode, "deterministic-fallback");
  assert.equal(res.taskGraph.missionId, "m-fallback");
  assert.ok(res.taskGraph.tasks.length > 0);
  assert.equal(app.executeCalls.length, 0);
});

test("SemanticPlanner throws error when provider is unavailable and allowFallback is false", async () => {
  const app = new MockApp("{}", { installed: false });
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true }
  });

  await assert.rejects(
    () => planner.plan({
      missionBrief: { id: "m-fallback", objective: "Write developer setup documentation", requirements: [] },
      missionId: "m-fallback",
      taskRelevantContext: { items: [] },
      allowFallback: false
    }),
    /unavailable and fallback is disabled/
  );
});

test("SemanticPlanner uses fallback when all retries fail on malformed JSON and allowFallback is true", async () => {
  const app = new MockApp("Invalid output on all retries");
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true },
    maxRetries: 3
  });

  const res = await planner.plan({
    missionBrief: { id: "m-fallback", objective: "Write developer setup documentation", requirements: ["Document prerequisites"] },
    missionId: "m-fallback",
    taskRelevantContext: { items: [] },
    allowFallback: true
  });

  assert.equal(res.planningMode, "deterministic-fallback");
  assert.equal(res.taskGraph.missionId, "m-fallback");
  assert.equal(app.executeCalls.length, 3);
});

test("Structured JSON parsing handles markdown code blocks", async () => {
  const jsonContent = JSON.stringify({
    tasks: [
      { id: "task-1", title: "Inspect Configuration", objective: "Check config files", type: "analyze", dependsOn: [] }
    ],
    assumptions: [],
    rationale: "From markdown code block"
  });

  const wrappedInMarkdown = `Here is the requested plan in JSON:\n\`\`\`json\n${jsonContent}\n\`\`\`\nHope this helps!`;

  const app = new MockApp(wrappedInMarkdown);
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: "opencode", model: "llama3.3", local: true }
  });

  const res = await planner.plan({
    missionBrief: { id: "m-md", objective: "Inspect Configuration", requirements: [] },
    missionId: "m-md",
    taskRelevantContext: { items: [] }
  });

  assert.equal(res.planningMode, "local-ai");
  assert.equal(res.taskGraph.missionId, "m-md");
  assert.equal(res.taskGraph.tasks[0].id, "task-1");
  assert.equal(res.taskGraph.tasks[0].metadata.semantic.title, "Inspect Configuration");
});
