"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decompose } = require("../runtime/planner/task-decomposer");
const { formatTasks } = require("../runtime/planner/task-formatter");

test("decompose façade returns legacy executable task list when provider target is resolved", () => {
  const spec = {
    answers: { intent: "Create customer CRUD" },
    facts: { stack: "Node.js" }
  };
  const tasks = decompose(spec, { availableProviders: ["opencode"] });
  assert.ok(Array.isArray(tasks));
  assert.ok(tasks.length >= 3);
  assert.ok(tasks[0].id);
  assert.ok(tasks[0].label);
  assert.ok(tasks[0].description);
  assert.equal(tasks[0].provider, "opencode");
});

test("decompose façade throws MISSING_EXECUTION_TARGET if no provider is available", () => {
  const spec = { answers: { intent: "Create customer CRUD" } };
  assert.throws(
    () => decompose(spec, { availableProviders: [] }),
    /MISSING_EXECUTION_TARGET/
  );
});

test("formatTasks renders semantic task label and header cleanly", () => {
  const tasks = [
    { id: "t1", label: "Implement Product persistence", complexity: "medium", provider: "opencode" }
  ];
  const formatted = formatTasks(tasks, 80);
  assert.ok(formatted.includes("01  Implement Product persistence"));
  assert.ok(formatted.includes("MEDIUM · Opencode"));
});
