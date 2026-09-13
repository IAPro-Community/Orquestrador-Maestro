"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../runtime/core");
const {
  TASK_RISK_LEVELS,
  TASK_COMPLEXITY_LEVELS,
  ENGINEERING_CAPABILITIES,
  PLANNING_MODES,
  createSemanticTask,
  createPlanningAssumption,
  createTaskGraphProposal,
  toCoreTask,
  toCoreTaskGraph,
  fromCoreTaskGraph
} = require("../runtime/planner/task-graph-proposal");

test("exports standard constants", () => {
  assert.deepEqual(TASK_RISK_LEVELS, ["low", "medium", "high", "critical"]);
  assert.deepEqual(TASK_COMPLEXITY_LEVELS, ["simple", "medium", "complex", "expert"]);
  assert.deepEqual(ENGINEERING_CAPABILITIES, [
    "backend",
    "frontend",
    "database",
    "testing",
    "security",
    "documentation",
    "infrastructure",
    "architecture"
  ]);
  assert.deepEqual(PLANNING_MODES, ["local-ai", "deterministic-fallback"]);
});

test("createSemanticTask creates frozen task with pure semantic fields", () => {
  const task = createSemanticTask({
    id: "task-1",
    title: "Implement Product persistence",
    objective: "Create repository layer for products",
    type: "persistence",
    dependsOn: ["task-0"],
    acceptanceCriteria: ["Product can be saved and retrieved"],
    verificationHints: ["npm test"],
    requiredSkills: ["database"],
    requiredCapabilities: ["database", "backend"],
    complexity: "medium",
    risk: "low",
    sourceRequirements: ["Requirement 1"],
    planningReason: "Provide data access",
    dependencyReasons: { "task-0": "Needs domain model" }
  });

  assert.equal(task.id, "task-1");
  assert.equal(task.title, "Implement Product persistence");
  assert.equal(task.risk, "low");
  assert.equal(task.complexity, "medium");
  assert.deepEqual(task.requiredCapabilities, ["database", "backend"]);
  assert.ok(Object.isFrozen(task));
});

test("createSemanticTask throws on routing fields (provider, model, estimatedCost)", () => {
  assert.throws(
    () => createSemanticTask({ id: "t1", title: "T", objective: "O", provider: "codex" }),
    /ROUTING_CONTAMINATION/
  );
  assert.throws(
    () => createSemanticTask({ id: "t1", title: "T", objective: "O", model: "gpt-4" }),
    /ROUTING_CONTAMINATION/
  );
  assert.throws(
    () => createSemanticTask({ id: "t1", title: "T", objective: "O", estimatedCost: 0.5 }),
    /ROUTING_CONTAMINATION/
  );
});

test("createSemanticTask rejects executor capabilities (headless, structuredEvents)", () => {
  assert.throws(
    () => createSemanticTask({ id: "t1", title: "T", objective: "O", requiredCapabilities: ["headless"] }),
    /INVALID_ENGINEERING_CAPABILITY/
  );
});

test("createPlanningAssumption creates structured assumption", () => {
  const assumption = createPlanningAssumption({
    text: "PostgreSQL 15 is running locally",
    critical: false,
    dimension: "database"
  });
  assert.equal(assumption.text, "PostgreSQL 15 is running locally");
  assert.equal(assumption.critical, false);
  assert.ok(Object.isFrozen(assumption));
});

test("createTaskGraphProposal creates valid frozen proposal", () => {
  const sTask = createSemanticTask({
    id: "task-1",
    title: "Implement Domain",
    objective: "Define product entities",
    requiredCapabilities: ["backend"]
  });
  const proposal = createTaskGraphProposal({
    planningMode: "local-ai",
    tasks: [sTask],
    assumptions: ["Assume node 18"],
    warnings: ["Minor warning"],
    blockers: [],
    rationale: "Solid architecture"
  });
  assert.equal(proposal.planningMode, "local-ai");
  assert.equal(proposal.tasks.length, 1);
  assert.equal(proposal.assumptions.length, 1);
  assert.equal(proposal.assumptions[0].text, "Assume node 18");
  assert.equal(proposal.rationale, "Solid architecture");
  assert.ok(Object.isFrozen(proposal));
});

test("toCoreTask converts SemanticTask to Core Task with semantic metadata", () => {
  const sTask = createSemanticTask({
    id: "task-1",
    title: "Implement Domain",
    objective: "Define product entities",
    requiredCapabilities: ["backend"]
  });
  const coreTask = toCoreTask(sTask, { projectId: "proj-1" });
  assert.equal(coreTask.id, "task-1");
  assert.equal(coreTask.projectId, "proj-1");
  assert.equal(coreTask.description, "Implement Domain: Define product entities");
  assert.deepEqual(coreTask.metadata.semantic, sTask);
});

test("toCoreTaskGraph preserves planningMode and metadata in Core TaskGraph", () => {
  const sTask = createSemanticTask({
    id: "task-1",
    title: "Implement Domain",
    objective: "Define product entities",
    type: "domain",
    dependsOn: [],
    acceptanceCriteria: ["Entity created"],
    requiredCapabilities: ["backend"],
    complexity: "simple",
    risk: "low"
  });

  const coreGraph = toCoreTaskGraph({
    id: "graph-1",
    missionId: "mission-1",
    semanticTasks: [sTask],
    metadata: { planningMode: "local-ai", planningRationale: "High cohesion" }
  });

  assert.equal(coreGraph.id, "graph-1");
  assert.equal(coreGraph.missionId, "mission-1");
  assert.deepEqual(coreGraph.dependencies, { "task-1": [] });
  assert.equal(coreGraph.metadata.planningMode, "local-ai");
  assert.equal(coreGraph.metadata.planningRationale, "High cohesion");

  const roundTripped = fromCoreTaskGraph(coreGraph);
  assert.equal(roundTripped.semanticTasks.length, 1);
  assert.deepEqual(roundTripped.semanticTasks[0], sTask);
  assert.equal(roundTripped.metadata.planningMode, "local-ai");
});

test("fromCoreTaskGraph reconstructs SemanticTask list without loss", () => {
  const sTask1 = createSemanticTask({
    id: "task-1",
    title: "Task 1",
    objective: "Objective 1",
    type: "backend",
    dependsOn: [],
    acceptanceCriteria: ["A"],
    verificationHints: ["V"],
    requiredSkills: ["S"],
    requiredCapabilities: ["backend"],
    complexity: "simple",
    risk: "low",
    sourceRequirements: ["R1"],
    planningReason: "PR",
    dependencyReasons: {}
  });
  const sTask2 = createSemanticTask({
    id: "task-2",
    title: "Task 2",
    objective: "Objective 2",
    type: "testing",
    dependsOn: ["task-1"],
    acceptanceCriteria: ["B"],
    verificationHints: ["V2"],
    requiredSkills: [],
    requiredCapabilities: ["testing"],
    complexity: "medium",
    risk: "medium",
    sourceRequirements: ["R2"],
    planningReason: "PR2",
    dependencyReasons: { "task-1": "depends on 1" }
  });

  const coreGraph = toCoreTaskGraph({
    id: "graph-123",
    missionId: "mission-456",
    semanticTasks: [sTask1, sTask2],
    metadata: { planningMode: "deterministic-fallback", customFlag: true }
  });

  const reconstructed = fromCoreTaskGraph(coreGraph);
  assert.equal(reconstructed.id, "graph-123");
  assert.equal(reconstructed.missionId, "mission-456");
  assert.equal(reconstructed.metadata.planningMode, "deterministic-fallback");
  assert.equal(reconstructed.metadata.customFlag, true);
  assert.deepEqual(reconstructed.semanticTasks, [sTask1, sTask2]);
});
