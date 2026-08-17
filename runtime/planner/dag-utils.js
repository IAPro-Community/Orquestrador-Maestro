"use strict";

/**
 * Derives canonical dependency map from tasks' dependsOn arrays.
 *
 * @param {Array<Object>} tasks - List of task objects with id and optional dependsOn
 * @returns {Record<string, string[]>} Frozen map from taskId to array of dependency taskIds
 */
function deriveDependencies(tasks) {
  if (!Array.isArray(tasks)) return {};
  const map = {};
  for (const task of tasks) {
    if (task && typeof task.id === "string") {
      map[task.id] = Array.isArray(task.dependsOn) ? [...task.dependsOn] : [];
    }
  }
  return Object.freeze(map);
}

/**
 * Validates DAG structure using Kahn's algorithm for cycle detection,
 * checks for self-dependencies, dangling dependencies, and conflicting external dependency mappings.
 *
 * @param {Array<Object>} tasks - List of task objects
 * @param {Record<string, string[]>|null} externalDependenciesMap - Optional external map to compare against canonical dependsOn
 * @returns {{valid: boolean, errors: ReadonlyArray<string>, involvedTaskIds: ReadonlyArray<string>, topologicalOrder: ReadonlyArray<string>}}
 */
function validateDAG(tasks, externalDependenciesMap = null) {
  if (!Array.isArray(tasks)) {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(["tasks must be an array"]),
      involvedTaskIds: Object.freeze([]),
      topologicalOrder: Object.freeze([])
    });
  }

  const errors = [];
  const taskIds = new Set(tasks.map((t) => (t && t.id)).filter(Boolean));
  const dependencies = deriveDependencies(tasks);

  if (externalDependenciesMap && typeof externalDependenciesMap === "object") {
    for (const [id, deps] of Object.entries(externalDependenciesMap)) {
      const canonical = dependencies[id] || [];
      const depsArr = Array.isArray(deps) ? deps : [];
      const canonicalSet = new Set(canonical);
      const depsSet = new Set(depsArr);
      const setsEqual = canonicalSet.size === depsSet.size && [...canonicalSet].every((d) => depsSet.has(d));
      if (!setsEqual) {
        errors.push(`CONFLICTING_DEPENDENCY_MAPPING: task ${id} canonical dependsOn does not match external dependencies`);
      }
    }
  }

  for (const task of tasks) {
    if (!task || typeof task.id !== "string") continue;
    const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
    for (const dep of deps) {
      if (dep === task.id) {
        errors.push(`SELF_DEPENDENCY: task ${task.id} depends on itself`);
      } else if (!taskIds.has(dep)) {
        errors.push(`DANGLING_DEPENDENCY: task ${task.id} depends on non-existent task ${dep}`);
      }
    }
  }

  const inDegree = new Map();
  const adj = new Map();
  for (const id of taskIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const [id, deps] of Object.entries(dependencies)) {
    for (const dep of deps) {
      if (taskIds.has(dep) && dep !== id) {
        inDegree.set(id, (inDegree.get(id) || 0) + 1);
        adj.get(dep).push(id);
      }
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topologicalOrder = [];
  while (queue.length > 0) {
    const u = queue.shift();
    topologicalOrder.push(u);
    for (const v of adj.get(u) || []) {
      inDegree.set(v, inDegree.get(v) - 1);
      if (inDegree.get(v) === 0) queue.push(v);
    }
  }

  const involvedTaskIds = [];
  if (topologicalOrder.length !== taskIds.size) {
    for (const [id, deg] of inDegree.entries()) {
      if (deg > 0) involvedTaskIds.push(id);
    }
    errors.push(`CYCLE_DETECTED: cycle involving tasks [${involvedTaskIds.join(", ")}]`);
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    involvedTaskIds: Object.freeze(involvedTaskIds),
    topologicalOrder: Object.freeze(topologicalOrder)
  });
}

module.exports = {
  deriveDependencies,
  validateDAG
};
