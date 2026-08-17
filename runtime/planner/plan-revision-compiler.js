"use strict";

const { createTaskGraphProposal } = require("./task-graph-proposal");
const { GraphValidator } = require("./graph-validator");

function parseTasksFromMarkdown(markdown) {
  if (typeof markdown !== "string") return [];

  const tasks = [];
  const taskBlocks = markdown.split(/^### \d+\.\s+/m).slice(1);

  for (const block of taskBlocks) {
    const task = {};
    const lines = block.split("\n");
    let title = lines[0] || "";
    if (title.trim().startsWith("- ") || title.trim().startsWith("* ")) {
      title = "";
    } else {
      title = title.trim();
    }
    task.title = title;

    for (const line of lines) {
      if (line.startsWith("## ")) break;

      const boldMatch = line.match(/^- \*\*(\w+)\*\*:\s*(.+)$/);
      if (boldMatch) {
        const key = boldMatch[1];
        const value = boldMatch[2].trim();
        task[key] = value;
      }

      const listMatch = line.match(/^  - (.+)$/);
      if (listMatch && task._currentKey) {
        if (!Array.isArray(task[task._currentKey])) {
          task[task._currentKey] = [];
        }
        task[task._currentKey].push(listMatch[1].trim());
      }

      const arrayHeaderMatch = line.match(/^- \*\*(\w+)\*\*:\s*$/);
      if (arrayHeaderMatch) {
        task._currentKey = arrayHeaderMatch[1];
      }
    }

    delete task._currentKey;

    if (task.dependsOn && typeof task.dependsOn === "string") {
      task.dependsOn = task.dependsOn.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (!Array.isArray(task.dependsOn)) {
      task.dependsOn = [];
    }

    if (task.requiredCapabilities && typeof task.requiredCapabilities === "string") {
      task.requiredCapabilities = task.requiredCapabilities.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (!Array.isArray(task.requiredCapabilities)) {
      task.requiredCapabilities = [];
    }

    if (task.acceptanceCriteria && typeof task.acceptanceCriteria === "string") {
      task.acceptanceCriteria = [task.acceptanceCriteria];
    } else if (!Array.isArray(task.acceptanceCriteria)) {
      task.acceptanceCriteria = [];
    }

    if (task.requiredSkills && typeof task.requiredSkills === "string") {
      task.requiredSkills = task.requiredSkills.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (!Array.isArray(task.requiredSkills)) {
      task.requiredSkills = [];
    }

    if (typeof task.risk === "string") {
      task.risk = task.risk.trim().toLowerCase();
    }
    if (typeof task.complexity === "string") {
      task.complexity = task.complexity.trim().toLowerCase();
    }

    tasks.push(task);
  }

  return tasks;
}

class PlanRevisionCompiler {
  compile(originalContent, modifiedContent, originalProposal, options = {}) {
    if (originalContent === modifiedContent) {
      return Object.freeze({
        changed: false,
        valid: true,
        proposal: null,
        tasks: [],
        errors: [],
        warnings: []
      });
    }

    const tasks = parseTasksFromMarkdown(modifiedContent);
    const errors = [];
    const warnings = [];

    if (tasks.length === 0) {
      return Object.freeze({
        changed: true,
        valid: false,
        proposal: null,
        tasks: [],
        errors: Object.freeze(["No tasks found in plan"]),
        warnings: Object.freeze(warnings)
      });
    }

    for (const t of tasks) {
      if (!t.id || typeof t.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(t.id.trim())) {
        errors.push(`Invalid task ID format: "${t.id}"`);
      }
      if (!t.title || typeof t.title !== "string" || t.title.trim() === "") {
        errors.push(`Task title cannot be empty for task "${t.id || 'unknown'}"`);
      }
      if (!t.objective || typeof t.objective !== "string" || t.objective.trim() === "") {
        errors.push(`Task objective cannot be empty for task "${t.id || 'unknown'}"`);
      }
    }

    if (originalProposal && Array.isArray(originalProposal.tasks)) {
      const newIds = new Set(tasks.map((t) => t.id));
      for (const orig of originalProposal.tasks) {
        if (!newIds.has(orig.id)) {
          const msg = `Task "${orig.id}" was removed from the plan`;
          if (options.allowTaskRemoval === false) {
            errors.push(msg);
          } else {
            warnings.push(msg);
          }
        }
      }
    }

    const taskInput = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      objective: t.objective,
      type: t.type || "other",
      dependsOn: t.dependsOn || [],
      acceptanceCriteria: t.acceptanceCriteria || [],
      verificationHints: t.verificationHints || [],
      requiredSkills: t.requiredSkills || [],
      requiredCapabilities: t.requiredCapabilities || [],
      complexity: t.complexity || "medium",
      risk: t.risk || "low",
      sourceRequirements: t.sourceRequirements || [],
      planningReason: t.planningReason || "",
      dependencyReasons: t.dependencyReasons || {}
    }));

    let proposal;
    try {
      proposal = createTaskGraphProposal({
        planningMode: "deterministic-fallback",
        tasks: taskInput,
        assumptions: [],
        warnings: [],
        blockers: []
      });
    } catch (err) {
      errors.push(`Task validation failed: ${err.message}`);
      return Object.freeze({
        changed: true,
        valid: false,
        proposal: null,
        tasks: Object.freeze(tasks.map((t) => Object.freeze({ ...t }))),
        errors: Object.freeze(errors),
        warnings: Object.freeze(warnings)
      });
    }

    const validation = GraphValidator.validate(proposal);

    for (const blocker of validation.blockers) {
      errors.push(blocker.message);
    }
    for (const warn of validation.warnings) {
      warnings.push(warn.message);
    }

    const isValid = errors.length === 0 && validation.valid;

    return Object.freeze({
      changed: true,
      valid: isValid,
      proposal: isValid ? validation.normalizedProposal : null,
      tasks: Object.freeze(proposal.tasks.map((t) => Object.freeze({ ...t }))),
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings)
    });
  }
}

module.exports = { PlanRevisionCompiler, parseTasksFromMarkdown };
