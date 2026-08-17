"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateDAG, deriveDependencies } = require("../runtime/planner/dag-utils");

test("deriveDependencies builds canonical map from tasks dependsOn", () => {
  const tasks = [
    { id: "t1", dependsOn: [] },
    { id: "t2", dependsOn: ["t1"] },
    { id: "t3", dependsOn: ["t1", "t2"] }
  ];
  assert.deepEqual(deriveDependencies(tasks), {
    t1: [],
    t2: ["t1"],
    t3: ["t1", "t2"]
  });
});

test("validateDAG accepts valid sequential and parallel graphs", () => {
  const tasks = [
    { id: "a", dependsOn: [] },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["a"] },
    { id: "d", dependsOn: ["b", "c"] }
  ];
  const res = validateDAG(tasks);
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.topologicalOrder, ["a", "b", "c", "d"]);
});

test("validateDAG rejects self-dependency", () => {
  const tasks = [{ id: "a", dependsOn: ["a"] }];
  const res = validateDAG(tasks);
  assert.equal(res.valid, false);
  assert.match(res.errors[0], /SELF_DEPENDENCY/);
});

test("validateDAG rejects dangling dependency", () => {
  const tasks = [{ id: "a", dependsOn: ["non-existent"] }];
  const res = validateDAG(tasks);
  assert.equal(res.valid, false);
  assert.match(res.errors[0], /DANGLING_DEPENDENCY/);
});

test("detectCycle returns involvedTaskIds on cycle via Kahn algorithm", () => {
  const tasks = [
    { id: "a", dependsOn: ["c"] },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["b"] },
    { id: "d", dependsOn: [] }
  ];
  const res = validateDAG(tasks);
  assert.equal(res.valid, false);
  assert.match(res.errors[0], /CYCLE_DETECTED/);
  assert.deepEqual([...res.involvedTaskIds].sort(), ["a", "b", "c"]);
});

test("preserves explicit dependencies without transitive reduction", () => {
  const tasks = [
    { id: "a", dependsOn: [] },
    { id: "b", dependsOn: ["a"] },
    { id: "c", dependsOn: ["a", "b"] }
  ];
  const derived = deriveDependencies(tasks);
  assert.deepEqual(derived.c, ["a", "b"]);
});

test("validateDAG checks conflicting external dependencies map", () => {
  const tasks = [
    { id: "t1", dependsOn: [] },
    { id: "t2", dependsOn: ["t1"] }
  ];
  const externalDependenciesMap = {
    t1: [],
    t2: ["mismatch"]
  };
  const res = validateDAG(tasks, externalDependenciesMap);
  assert.equal(res.valid, false);
  assert.match(res.errors[0], /CONFLICTING_DEPENDENCY_MAPPING/);
});
