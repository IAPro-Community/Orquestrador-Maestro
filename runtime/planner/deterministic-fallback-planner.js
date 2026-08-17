"use strict";

const { createSemanticTask, createTaskGraphProposal } = require("./task-graph-proposal");

class DeterministicFallbackPlanner {
  static plan({ missionBrief, taskRelevantContext, resolvedSkills = [] } = {}) {
    if (!missionBrief || typeof missionBrief.objective !== "string" || missionBrief.objective.trim() === "") {
      throw new Error("INSUFFICIENT_MISSION_BRIEF: objective is required for deterministic planning");
    }

    const objective = missionBrief.objective.trim();
    const requirements = missionBrief.requirements || [];
    const lowerObj = objective.toLowerCase();
    const tasks = [];
    let counter = 1;

    const isDoc = /\b(doc|documentation|guia|readme|tutorial|manual)\b/i.test(lowerObj);
    const isTestOnly = /\b(test|tests|testes|coverage|cobertura)\b/i.test(lowerObj) && !/\b(crud|api|feature|sistema)\b/i.test(lowerObj);
    const isFrontendOnly = /\b(landing page|banner|ui|css|html|frontend|hero section)\b/i.test(lowerObj) && !/\b(backend|database|sql|banco)\b/i.test(lowerObj);
    const isDangerous = /\b(drop|delete|purge|remove production|truncate)\b/i.test(lowerObj);

    if (isDoc) {
      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Analyze documentation structure",
        objective: `Analyze existing docs and outline structure for: ${objective}`,
        type: "analyze",
        dependsOn: [],
        requiredCapabilities: ["documentation"],
        requiredSkills: resolvedSkills,
        complexity: "simple",
        risk: "low",
        acceptanceCriteria: ["Target documentation layout identified"]
      }));

      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Author documentation",
        objective: `Document content: ${requirements.join("; ") || objective}`,
        type: "documentation",
        dependsOn: ["task-1"],
        requiredCapabilities: ["documentation"],
        requiredSkills: resolvedSkills,
        complexity: "simple",
        risk: "low",
        acceptanceCriteria: ["Documentation written and validated"]
      }));
    } else if (isTestOnly) {
      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Analyze existing test suite conventions",
        objective: `Inspect testing framework and patterns for: ${objective}`,
        type: "analyze",
        dependsOn: [],
        requiredCapabilities: ["testing", "architecture"],
        requiredSkills: resolvedSkills,
        complexity: "simple",
        risk: "low",
        acceptanceCriteria: ["Test runners and helper conventions identified"]
      }));

      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Implement unit and integration tests",
        objective: `Add tests for: ${requirements.join("; ") || objective}`,
        type: "test",
        dependsOn: ["task-1"],
        requiredCapabilities: ["testing"],
        requiredSkills: resolvedSkills,
        complexity: "medium",
        risk: "low",
        acceptanceCriteria: ["All new tests pass successfully"]
      }));
    } else if (isFrontendOnly) {
      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Design UI component structure",
        objective: `Outline component layout for: ${objective}`,
        type: "analyze",
        dependsOn: [],
        requiredCapabilities: ["frontend"],
        requiredSkills: resolvedSkills,
        complexity: "simple",
        risk: "low",
        acceptanceCriteria: ["Component hierarchy designed"]
      }));

      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Implement UI components",
        objective: `Build visual components for: ${requirements.join("; ") || objective}`,
        type: "ui",
        dependsOn: ["task-1"],
        requiredCapabilities: ["frontend"],
        requiredSkills: resolvedSkills,
        complexity: "medium",
        risk: "low",
        acceptanceCriteria: ["UI renders according to requirements"]
      }));
    } else {
      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Analyze architectural conventions",
        objective: `Inspect codebase patterns for: ${objective}`,
        type: "analyze",
        dependsOn: [],
        requiredCapabilities: ["architecture", "backend"],
        requiredSkills: resolvedSkills,
        complexity: "simple",
        risk: "low",
        acceptanceCriteria: ["Conventions and module layout established"]
      }));

      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Implement domain and persistence",
        objective: `Implement domain models and persistence for: ${objective}`,
        type: "persistence",
        dependsOn: ["task-1"],
        requiredCapabilities: ["backend", "database"],
        requiredSkills: resolvedSkills,
        complexity: "medium",
        risk: isDangerous ? "critical" : "low",
        acceptanceCriteria: ["Data access and domain logic implemented"]
      }));

      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Implement API and business rules",
        objective: `Expose operations for: ${objective}`,
        type: "api",
        dependsOn: ["task-2"],
        requiredCapabilities: ["backend"],
        requiredSkills: resolvedSkills,
        complexity: "medium",
        risk: isDangerous ? "high" : "low",
        acceptanceCriteria: ["API endpoints operational"]
      }));

      tasks.push(createSemanticTask({
        id: `task-${counter++}`,
        title: "Add integration tests",
        objective: `Add unit and integration tests for: ${objective}`,
        type: "test",
        dependsOn: ["task-3"],
        requiredCapabilities: ["testing"],
        requiredSkills: resolvedSkills,
        complexity: "simple",
        risk: "low",
        acceptanceCriteria: ["Test suite covers new functionality"]
      }));
    }

    return createTaskGraphProposal({
      planningMode: "deterministic-fallback",
      tasks,
      assumptions: [],
      warnings: [{ code: "DETERMINISTIC_FALLBACK_USED", message: "Plan was generated using heuristic fallback" }],
      rationale: `Deterministic decomposition for ${objective}`
    });
  }
}

module.exports = { DeterministicFallbackPlanner };
