"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GraphValidator } = require("../runtime/planner/graph-validator");
const { createTaskGraphProposal, createSemanticTask, createPlanningAssumption } = require("../runtime/planner/task-graph-proposal");

test("GraphValidator rejects duplicate task IDs", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Task 1", objective: "Obj 1" }),
      createSemanticTask({ id: "t1", title: "Task 1 dup", objective: "Obj 2" })
    ]
  });
  const res = GraphValidator.validate(proposal);
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "DUPLICATE_TASK_ID"));
});

test("GraphValidator rejects generic placeholder titles (PLANNING, SCAFFOLD, TEST, VERIFY)", () => {
  const genericTitles = ["PLANNING", "Scaffold", "implement", "TEST", "verify"];
  for (const title of genericTitles) {
    const proposal = createTaskGraphProposal({
      tasks: [createSemanticTask({ id: "t1", title, objective: "Some real objective" })]
    });
    const res = GraphValidator.validate(proposal);
    assert.equal(res.valid, false);
    assert.ok(res.blockers.some((b) => b.code === "GENERIC_TASK_TITLE_REJECTED"));
  }
});

test("GraphValidator escalates critical assumptions to PlanningBlocker", () => {
  const proposal = createTaskGraphProposal({
    tasks: [createSemanticTask({ id: "t1", title: "Implement Payments", objective: "Use Stripe" })],
    assumptions: [
      createPlanningAssumption({ text: "User wants Stripe API", critical: true, dimension: "payment_gateway" })
    ]
  });
  const res = GraphValidator.validate(proposal);
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "CRITICAL_ASSUMPTION_REQUIRES_REFINEMENT"));
});

test("GraphValidator normalization returns new immutable proposal without mutating original", () => {
  const original = createTaskGraphProposal({
    tasks: [createSemanticTask({ id: "t1", title: "  Trim Me  ", objective: " Objective " })]
  });
  const res = GraphValidator.validate(original);
  assert.equal(res.valid, true);
  assert.notEqual(res.normalizedProposal, original);
  assert.equal(res.normalizedProposal.tasks[0].title, "Trim Me");
  assert.equal(original.tasks[0].title, "Trim Me");
});

test("GraphValidator does not rewrite invalid task IDs silently", () => {
  assert.throws(
    () => createSemanticTask({ id: "   ", title: "Valid", objective: "Valid" }),
    /SemanticTask.id must be a non-empty string/
  );
});

test("GraphValidator rejects empty task graph when requireTasks is true", () => {
  const proposal = createTaskGraphProposal({
    tasks: []
  });
  const res = GraphValidator.validate(proposal);
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "EMPTY_TASK_GRAPH"));
});

test("GraphValidator catches DAG cycles and converts them to DAG_VALIDATION_FAILED blockers", () => {
  const proposal = createTaskGraphProposal({
    tasks: [
      createSemanticTask({ id: "t1", title: "Task 1", objective: "Obj 1", dependsOn: ["t2"] }),
      createSemanticTask({ id: "t2", title: "Task 2", objective: "Obj 2", dependsOn: ["t1"] })
    ]
  });
  const res = GraphValidator.validate(proposal);
  assert.equal(res.valid, false);
  assert.ok(res.blockers.some((b) => b.code === "DAG_VALIDATION_FAILED"));
});
