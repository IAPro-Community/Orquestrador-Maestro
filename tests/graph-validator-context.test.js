"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GraphValidator } = require("../runtime/planner/graph-validator");
const { createTaskGraphProposal, createSemanticTask } = require("../runtime/planner/task-graph-proposal");

test("FACT backend-only rejects proposal with frontend task (no silent stripping)", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Build API", objective: "Create REST endpoints", requiredCapabilities: ["backend"] }),
      createSemanticTask({ id: "t2", title: "Build React Form", objective: "Create UI form", requiredCapabilities: ["frontend"] })
    ]
  });

  const context = {
    items: [
      { key: "backend.framework", value: "Node.js", kind: "FACT" },
      { key: "project.frontend", value: null, kind: "FACT" }
    ]
  };

  const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "CONTEXT_FACT_CONTRADICTION" && b.taskId === "t2"));
});

test("FACT MongoDB rejects proposal with SQL migration task", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Create PostgreSQL Migration", objective: "Run knex migrate" })
    ]
  });

  const context = {
    items: [
      { key: "database.type", value: "mongodb", kind: "FACT" }
    ]
  };

  const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "DATABASE_CONTRADICTION"));
});

test("Mission constraint REST only rejects GraphQL task", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Implement GraphQL Schema", objective: "Create Apollo server resolvers" })
    ]
  });

  const missionBrief = {
    objective: "Create product API",
    constraints: ["REST only", "No GraphQL"]
  };

  const res = GraphValidator.validate(proposal, { missionBrief });
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "MISSION_CONSTRAINT_CONTRADICTION"));
});

test("USER_DECISION contradiction produces blocker", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Build React Form", objective: "Create UI form", requiredCapabilities: ["frontend"] })
    ]
  });

  const context = {
    items: [
      { key: "project.frontend", value: null, kind: "USER_DECISION" }
    ]
  };

  const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "CONTEXT_FACT_CONTRADICTION" && b.taskId === "t1"));
});

test("INFERENCE isolated generates warning without hard-rejecting proposal", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Implement Redis Cache", objective: "Add caching layer", requiredCapabilities: ["backend"] })
    ]
  });

  const context = {
    items: [
      { key: "cache.inferred", value: "memcached", kind: "INFERENCE", confidence: 0.6 }
    ]
  };

  const res = GraphValidator.validate(proposal, { taskRelevantContext: context });
  assert.equal(res.valid, true);
  assert.ok(res.warnings.some((w) => w.code === "INFERENCE_ADVISORY"));
});

test("Reusing persistence decision rejects proposal that switches database engine (Gap N2 fix)", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Migrate schema to MongoDB", objective: "Replace Postgres with Mongo" })
    ]
  });

  const missionBrief = {
    objective: "Evoluir a API de estoque",
    userDecisions: ["reutilizar persistencia existente"]
  };

  const context = {
    items: [
      { key: "database.type", value: "postgres", kind: "FACT" }
    ]
  };

  const res = GraphValidator.validate(proposal, { missionBrief, taskRelevantContext: context });
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "DATABASE_CONTRADICTION" && b.taskId === "t1"));
});
