"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PlanRevisionCompiler } = require("../runtime/planner/plan-revision-compiler");

function makeTask(id, title, objective, dependsOn = [], opts = {}) {
  return {
    id,
    title,
    objective,
    type: opts.type || "other",
    dependsOn,
    acceptanceCriteria: opts.acceptanceCriteria || [],
    requiredSkills: [],
    requiredCapabilities: opts.requiredCapabilities || [],
    complexity: opts.complexity || "medium",
    risk: opts.risk || "low",
    sourceRequirements: [],
    planningReason: "",
    dependencyReasons: {}
  };
}

const sampleProposal = {
  planningMode: "local-ai",
  tasks: [
    makeTask("task-1", "Analyze schema", "Inspect DB schema"),
    makeTask("task-2", "Implement API", "Create endpoint", ["task-1"]),
    makeTask("task-3", "Write tests", "Test endpoint", ["task-2"])
  ],
  assumptions: [{ text: "DB exists", critical: false }],
  warnings: [],
  blockers: [],
  rationale: "Sequential plan"
};

test("PlanRevisionCompiler.compile detects unchanged file", () => {
  const compiler = new PlanRevisionCompiler();
  const original = "# Plan\n\n## Tasks\n\n### 01. Analyze schema\n\n- **id**: task-1\n";
  const result = compiler.compile(original, original, sampleProposal);
  assert.equal(result.changed, false);
  assert.equal(result.valid, true);
  assert.ok(Array.isArray(result.tasks));
  assert.equal(result.tasks.length, 0);
});

test("PlanRevisionCompiler.compile parses valid modified plan", () => {
  const compiler = new PlanRevisionCompiler();
  const modified = `# Plan

## Tasks

### 01. Analyze schema

- **id**: task-1
- **type**: analyze
- **objective**: Inspect DB schema
- **complexity**: simple
- **risk**: low

### 02. Implement API

- **id**: task-2
- **type**: api
- **objective**: Create endpoint
- **dependsOn**: task-1
- **complexity**: medium
- **risk**: medium

## Parallelism Waves

### Wave 1

- task-1

### Wave 2

- task-2

## Metadata

- **planningMode**: local-ai
- **rationale**: Sequential plan
`;

  const proposalWithTwoTasks = {
    ...sampleProposal,
    tasks: sampleProposal.tasks.filter((t) => t.id !== "task-3")
  };
  const result = compiler.compile("# original", modified, proposalWithTwoTasks);
  assert.equal(result.changed, true);
  assert.equal(result.valid, true);
  assert.ok(Array.isArray(result.tasks));
  assert.ok(result.tasks.length > 0);
  assert.equal(result.tasks[0].id, "task-1");
  assert.equal(result.tasks[0].title, "Analyze schema");
  assert.equal(result.tasks[1].id, "task-2");
  assert.equal(result.tasks[1].title, "Implement API");
});

test("PlanRevisionCompiler.compile allows task removal (diff tracks it)", () => {
  const compiler = new PlanRevisionCompiler();
  const modified = `# Plan

## Tasks

### 01. Analyze schema

- **id**: task-1
- **type**: analyze
- **objective**: Inspect DB schema
`;

  const result = compiler.compile("# original", modified, sampleProposal);
  assert.equal(result.changed, true);
  assert.equal(result.valid, true);
  assert.equal(result.tasks.length, 1);
});

test("PlanRevisionCompiler.compile rejects task with invalid risk level", () => {
  const compiler = new PlanRevisionCompiler();
  const modified = `# Plan

## Tasks

### 01. My task

- **id**: task-new
- **type**: analyze
- **objective**: Test something
- **risk**: catastrophic
`;

  const result = compiler.compile("# original", modified, sampleProposal);
  assert.equal(result.changed, true);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("PlanRevisionCompiler.compile rejects plan with missing required fields", () => {
  const compiler = new PlanRevisionCompiler();
  const modified = `# Plan

## Tasks

### 01. My task

- **id**: task-new
- **type**: analyze
`;

  const result = compiler.compile("# original", modified, sampleProposal);
  assert.equal(result.changed, true);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("PlanRevisionCompiler.compile validates task graph structure", () => {
  const compiler = new PlanRevisionCompiler();
  const modified = `# Plan

## Tasks

### 01. Task A

- **id**: task-a
- **type**: analyze
- **objective**: Task A
- **dependsOn**: task-z

### 02. Task B

- **id**: task-b
- **type**: api
- **objective**: Task B
`;

  const result = compiler.compile("# original", modified, sampleProposal);
  assert.equal(result.changed, true);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("task-z") || e.includes("dangling") || e.includes("dependency")));
});

test("PlanRevisionCompiler.compile allows reordering tasks", () => {
  const compiler = new PlanRevisionCompiler();
  const modified = `# Plan

## Tasks

### 01. Implement API

- **id**: task-2
- **type**: api
- **objective**: Create endpoint
- **dependsOn**: task-1

### 02. Analyze schema

- **id**: task-1
- **type**: analyze
- **objective**: Inspect DB schema
`;

  const proposalWithTwoTasks = {
    ...sampleProposal,
    tasks: sampleProposal.tasks.filter((t) => t.id !== "task-3")
  };
  const result = compiler.compile("# original", modified, proposalWithTwoTasks);
  assert.equal(result.changed, true);
  assert.equal(result.valid, true);
  assert.equal(result.tasks[0].id, "task-2");
  assert.equal(result.tasks[1].id, "task-1");
});
