"use strict";

function computeSemanticDiff(originalTasks, revisedTasks) {
  if (!Array.isArray(originalTasks)) originalTasks = [];
  if (!Array.isArray(revisedTasks)) revisedTasks = [];

  const origMap = new Map(originalTasks.map((t) => [t.id, t]));
  const revMap = new Map(revisedTasks.map((t) => [t.id, t]));

  const addedTasks = [];
  const removedTasks = [];
  const changedTasks = [];
  const dependencyChanges = [];
  const riskChanges = [];
  const complexityChanges = [];
  const capabilityChanges = [];

  for (const [id, task] of revMap) {
    if (!origMap.has(id)) {
      addedTasks.push({ id, task });
    }
  }

  for (const [id, task] of origMap) {
    if (!revMap.has(id)) {
      removedTasks.push({ id, task });
    }
  }

  for (const [id, origTask] of origMap) {
    const revTask = revMap.get(id);
    if (!revTask) continue;

    const changes = [];

    if (origTask.title !== revTask.title) {
      changes.push({ field: "title", from: origTask.title, to: revTask.title });
    }
    if (origTask.objective !== revTask.objective) {
      changes.push({ field: "objective", from: origTask.objective, to: revTask.objective });
    }

    const origDeps = JSON.stringify([...(origTask.dependsOn || [])].sort());
    const revDeps = JSON.stringify([...(revTask.dependsOn || [])].sort());
    if (origDeps !== revDeps) {
      dependencyChanges.push({
        id,
        from: origTask.dependsOn || [],
        to: revTask.dependsOn || []
      });
    }

    if (origTask.risk !== revTask.risk) {
      riskChanges.push({ id, from: origTask.risk, to: revTask.risk });
    }

    if (origTask.complexity !== revTask.complexity) {
      complexityChanges.push({ id, from: origTask.complexity, to: revTask.complexity });
    }

    const origCaps = JSON.stringify([...(origTask.requiredCapabilities || [])].sort());
    const revCaps = JSON.stringify([...(revTask.requiredCapabilities || [])].sort());
    if (origCaps !== revCaps) {
      capabilityChanges.push({
        id,
        from: origTask.requiredCapabilities || [],
        to: revTask.requiredCapabilities || []
      });
    }

    if (changes.length > 0) {
      changedTasks.push({ id, changes });
    }
  }

  return Object.freeze({
    addedTasks: Object.freeze(addedTasks),
    removedTasks: Object.freeze(removedTasks),
    changedTasks: Object.freeze(changedTasks),
    dependencyChanges: Object.freeze(dependencyChanges),
    riskChanges: Object.freeze(riskChanges),
    complexityChanges: Object.freeze(complexityChanges),
    capabilityChanges: Object.freeze(capabilityChanges)
  });
}

function hasChanges(diff) {
  return diff.addedTasks.length > 0 ||
    diff.removedTasks.length > 0 ||
    diff.changedTasks.length > 0 ||
    diff.dependencyChanges.length > 0 ||
    diff.riskChanges.length > 0 ||
    diff.complexityChanges.length > 0 ||
    diff.capabilityChanges.length > 0;
}

function describeDiff(diff) {
  const parts = [];
  if (diff.addedTasks.length > 0) parts.push(`Added: ${diff.addedTasks.map((t) => t.id).join(", ")}`);
  if (diff.removedTasks.length > 0) parts.push(`Removed: ${diff.removedTasks.map((t) => t.id).join(", ")}`);
  if (diff.changedTasks.length > 0) parts.push(`Changed: ${diff.changedTasks.map((t) => t.id).join(", ")}`);
  if (diff.dependencyChanges.length > 0) parts.push(`Deps changed: ${diff.dependencyChanges.map((c) => c.id).join(", ")}`);
  if (diff.riskChanges.length > 0) parts.push(`Risk changed: ${diff.riskChanges.map((c) => c.id).join(", ")}`);
  if (diff.complexityChanges.length > 0) parts.push(`Complexity changed: ${diff.complexityChanges.map((c) => c.id).join(", ")}`);
  if (diff.capabilityChanges.length > 0) parts.push(`Capabilities changed: ${diff.capabilityChanges.map((c) => c.id).join(", ")}`);
  return parts.join("; ") || "No changes";
}

module.exports = { computeSemanticDiff, hasChanges, describeDiff };
