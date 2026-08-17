"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PlanArtifactRenderer } = require("../runtime/planner/plan-artifact-renderer");

test("PlanArtifactRenderer.render produces markdown with tasks, metadata, and parallelism waves", () => {
  const proposal = {
    planningMode: "local-ai",
    tasks: [
      {
        id: "task-1",
        title: "Analyze user schema",
        objective: "Inspect the existing user table schema",
        type: "analyze",
        dependsOn: [],
        acceptanceCriteria: ["Schema documented"],
        requiredSkills: [],
        requiredCapabilities: ["backend"],
        complexity: "simple",
        risk: "low",
        sourceRequirements: [],
        planningReason: "First task",
        dependencyReasons: {}
      },
      {
        id: "task-2",
        title: "Implement API endpoint",
        objective: "Create the /users endpoint",
        type: "api",
        dependsOn: ["task-1"],
        acceptanceCriteria: ["Endpoint returns 200"],
        requiredSkills: [],
        requiredCapabilities: ["backend"],
        complexity: "medium",
        risk: "medium",
        sourceRequirements: [],
        planningReason: "After schema analysis",
        dependencyReasons: { "task-1": "needs schema" }
      },
      {
        id: "task-3",
        title: "Write integration tests",
        objective: "Test the /users endpoint",
        type: "test",
        dependsOn: ["task-2"],
        acceptanceCriteria: ["Tests pass"],
        requiredSkills: [],
        requiredCapabilities: ["testing"],
        complexity: "simple",
        risk: "low",
        sourceRequirements: [],
        planningReason: "After API implementation",
        dependencyReasons: { "task-2": "needs endpoint" }
      }
    ],
    assumptions: [{ text: "User table exists", critical: false }],
    warnings: [],
    blockers: [],
    rationale: "Sequential implementation plan"
  };

  const missionBrief = {
    id: "brief-1",
    intentSessionId: "session-1",
    objective: "Build user API",
    requirements: ["REST endpoint"],
    constraints: [],
    relevantContext: "{}"
  };

  const taskRelevantContext = {
    intent: "Build user API",
    items: [{ key: "project.frontend", value: null, kind: "FACT", confidence: 1, relevance: 1, sources: [] }]
  };

  const result = PlanArtifactRenderer.render(proposal, { missionBrief, taskRelevantContext });
  assert.ok(typeof result === "string");
  assert.ok(result.includes("# Plan"));
  assert.ok(result.includes("## Tasks"));
  assert.ok(result.includes("task-1"));
  assert.ok(result.includes("task-2"));
  assert.ok(result.includes("task-3"));
  assert.ok(result.includes("## Parallelism Waves"));
  assert.ok(result.includes("Wave 1"));
  assert.ok(result.includes("Wave 2"));
  assert.ok(result.includes("Wave 3"));
  assert.ok(result.includes("## Metadata"));
  assert.ok(result.includes("planningMode"));
  assert.ok(result.includes("## Mission Brief"));
  assert.ok(result.includes("Build user API"));
  assert.ok(result.includes("## Context"));
  assert.ok(result.includes("project.frontend"));
});

test("PlanArtifactRenderer.render produces correct parallelism waves for independent tasks", () => {
  const proposal = {
    planningMode: "local-ai",
    tasks: [
      {
        id: "task-a",
        title: "Task A",
        objective: "Independent task A",
        type: "backend",
        dependsOn: [],
        acceptanceCriteria: [],
        requiredSkills: [],
        requiredCapabilities: [],
        complexity: "simple",
        risk: "low",
        sourceRequirements: [],
        planningReason: "",
        dependencyReasons: {}
      },
      {
        id: "task-b",
        title: "Task B",
        objective: "Independent task B",
        type: "backend",
        dependsOn: [],
        acceptanceCriteria: [],
        requiredSkills: [],
        requiredCapabilities: [],
        complexity: "simple",
        risk: "low",
        sourceRequirements: [],
        planningReason: "",
        dependencyReasons: {}
      },
      {
        id: "task-c",
        title: "Task C",
        objective: "Depends on both A and B",
        type: "test",
        dependsOn: ["task-a", "task-b"],
        acceptanceCriteria: [],
        requiredSkills: [],
        requiredCapabilities: [],
        complexity: "simple",
        risk: "low",
        sourceRequirements: [],
        planningReason: "",
        dependencyReasons: {}
      }
    ],
    assumptions: [],
    warnings: [],
    blockers: [],
    rationale: "Parallel plan"
  };

  const result = PlanArtifactRenderer.render(proposal);
  assert.ok(result.includes("Wave 1"));
  assert.ok(result.includes("task-a"));
  assert.ok(result.includes("task-b"));
  assert.ok(result.includes("Wave 2"));
  assert.ok(result.includes("task-c"));
});

test("PlanArtifactRenderer.render handles empty tasks", () => {
  const proposal = {
    planningMode: "deterministic-fallback",
    tasks: [],
    assumptions: [],
    warnings: [],
    blockers: [],
    rationale: "No tasks"
  };

  const result = PlanArtifactRenderer.render(proposal);
  assert.ok(result.includes("# Plan"));
  assert.ok(result.includes("No tasks"));
});

test("PlanArtifactRenderer.render includes assumptions and warnings", () => {
  const proposal = {
    planningMode: "local-ai",
    tasks: [],
    assumptions: [{ text: "Critical assumption", critical: true, dimension: "scope" }],
    warnings: ["Low confidence in context"],
    blockers: [],
    rationale: "Test"
  };

  const result = PlanArtifactRenderer.render(proposal);
  assert.ok(result.includes("## Assumptions"));
  assert.ok(result.includes("Critical assumption"));
  assert.ok(result.includes("## Warnings"));
  assert.ok(result.includes("Low confidence in context"));
});

test("PlanArtifactRenderer.render includes complexity and risk per task", () => {
  const proposal = {
    planningMode: "local-ai",
    tasks: [
      {
        id: "task-1",
        title: "Complex task",
        objective: "High risk",
        type: "security",
        dependsOn: [],
        acceptanceCriteria: [],
        requiredSkills: [],
        requiredCapabilities: ["security"],
        complexity: "complex",
        risk: "critical",
        sourceRequirements: [],
        planningReason: "",
        dependencyReasons: {}
      }
    ],
    assumptions: [],
    warnings: [],
    blockers: [],
    rationale: ""
  };

  const result = PlanArtifactRenderer.render(proposal);
  assert.ok(result.includes("complexity"));
  assert.ok(result.includes("critical"));
  assert.ok(result.includes("security"));
});
