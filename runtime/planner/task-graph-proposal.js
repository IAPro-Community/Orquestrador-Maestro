"use strict";

const core = require("../core");
const { deriveDependencies } = require("./dag-utils");
const { CHANGE_CLASSES, SCOPE_CLASSIFICATIONS, classifyChange } = require("../governance/change-governance");
const { deriveOutcomeContract: deriveGovernanceOutcomeContract } = require("../governance/change-governance");

const TASK_RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);
const TASK_COMPLEXITY_LEVELS = Object.freeze(["simple", "medium", "complex", "expert"]);
const ENGINEERING_CAPABILITIES = Object.freeze([
  "backend",
  "frontend",
  "database",
  "testing",
  "security",
  "documentation",
  "infrastructure",
  "architecture"
]);
const PLANNING_MODES = Object.freeze(["local-ai", "deterministic-fallback"]);

function normalizeAncestry(value) {
  if (value === undefined || value === null) return Object.freeze({});
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("SemanticTask.ancestry must be an object");
  }
  const ancestry = {};
  for (const key of ["goalId", "parentTaskId", "causedByDecisionId", "outcomeId"]) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string" || value[key].trim() === "") {
        throw new TypeError(`SemanticTask.ancestry.${key} must be a non-empty string`);
      }
      ancestry[key] = value[key].trim();
    }
  }
  return Object.freeze(ancestry);
}

function createSemanticTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("SemanticTask input must be an object");
  }

  if ("provider" in input || "model" in input || "estimatedCost" in input) {
    throw new TypeError("ROUTING_CONTAMINATION: SemanticTask cannot contain provider, model, or estimatedCost");
  }

  if (typeof input.id !== "string" || input.id.trim() === "") {
    throw new TypeError("SemanticTask.id must be a non-empty string");
  }
  if (typeof input.title !== "string" || input.title.trim() === "") {
    throw new TypeError("SemanticTask.title must be a non-empty string");
  }
  if (typeof input.objective !== "string" || input.objective.trim() === "") {
    throw new TypeError("SemanticTask.objective must be a non-empty string");
  }

  const risk = input.risk || "low";
  if (!TASK_RISK_LEVELS.includes(risk)) {
    throw new TypeError(`SemanticTask.risk must be one of: ${TASK_RISK_LEVELS.join(", ")}`);
  }

  const complexity = input.complexity || "medium";
  if (!TASK_COMPLEXITY_LEVELS.includes(complexity)) {
    throw new TypeError(`SemanticTask.complexity must be one of: ${TASK_COMPLEXITY_LEVELS.join(", ")}`);
  }

  const rawCaps = Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : [];
  const requiredCapabilities = rawCaps.map((cap) => {
    if (!ENGINEERING_CAPABILITIES.includes(cap)) {
      throw new TypeError(`INVALID_ENGINEERING_CAPABILITY: ${cap} is not a valid engineering capability`);
    }
    return cap;
  });

  const scopeClassification = input.scopeClassification || "IN_SCOPE";
  if (!SCOPE_CLASSIFICATIONS.includes(scopeClassification)) {
    throw new TypeError(`SemanticTask.scopeClassification must be one of: ${SCOPE_CLASSIFICATIONS.join(", ")}`);
  }
  const scopeJustification = typeof input.scopeJustification === "string" ? input.scopeJustification.trim() : "";
  if (scopeClassification === "REQUIRED_DEPENDENCY" && !scopeJustification) {
    throw new TypeError("SemanticTask scope justification is required for REQUIRED_DEPENDENCY");
  }
  const change = classifyChange({ text: `${input.title} ${input.objective}`, changeClass: input.changeClass });

  return Object.freeze({
    id: input.id.trim(),
    title: input.title.trim(),
    objective: input.objective.trim(),
    type: typeof input.type === "string" ? input.type.trim() : "other",
    dependsOn: Object.freeze(Array.isArray(input.dependsOn) ? [...input.dependsOn] : []),
    acceptanceCriteria: Object.freeze(Array.isArray(input.acceptanceCriteria) ? [...input.acceptanceCriteria] : []),
    verificationHints: Object.freeze(Array.isArray(input.verificationHints) ? [...input.verificationHints] : []),
    requiredSkills: Object.freeze(Array.isArray(input.requiredSkills) ? [...input.requiredSkills] : []),
    requiredCapabilities: Object.freeze(requiredCapabilities),
    complexity,
    risk,
    changeClass: Object.prototype.hasOwnProperty.call(CHANGE_CLASSES, input.changeClass) ? input.changeClass : change.changeClass,
    scopeClassification,
    scopeJustification,
    sourceRequirements: Object.freeze(Array.isArray(input.sourceRequirements) ? [...input.sourceRequirements] : []),
    planningReason: typeof input.planningReason === "string" ? input.planningReason.trim() : "",
    dependencyReasons: Object.freeze(
      input.dependencyReasons && typeof input.dependencyReasons === "object"
        ? { ...input.dependencyReasons }
        : {}
    ),
    ancestry: normalizeAncestry(input.ancestry),
    expectedOutcome: typeof input.expectedOutcome === "string" && input.expectedOutcome.trim()
      ? input.expectedOutcome.trim()
      : input.objective.trim(),
    evidenceRequirements: Object.freeze(Array.isArray(input.evidenceRequirements)
      ? input.evidenceRequirements.map((item) => String(item).trim()).filter(Boolean)
      : [])
  });
}

const deriveOutcomeContract = deriveGovernanceOutcomeContract;

function createPlanningAssumption(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("PlanningAssumption input must be an object");
  }
  if (typeof input.text !== "string" || input.text.trim() === "") {
    throw new TypeError("PlanningAssumption.text must be a non-empty string");
  }
  return Object.freeze({
    text: input.text.trim(),
    critical: Boolean(input.critical),
    dimension: typeof input.dimension === "string" ? input.dimension.trim() : undefined
  });
}

function createTaskGraphProposal(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("TaskGraphProposal input must be an object");
  }
  const planningMode = input.planningMode || "local-ai";
  if (!PLANNING_MODES.includes(planningMode)) {
    throw new TypeError(`TaskGraphProposal.planningMode must be one of: ${PLANNING_MODES.join(", ")}`);
  }

  return Object.freeze({
    planningMode,
    tasks: Object.freeze((input.tasks || []).map(createSemanticTask)),
    assumptions: Object.freeze(
      (input.assumptions || []).map((a) =>
        typeof a === "string" ? createPlanningAssumption({ text: a }) : createPlanningAssumption(a)
      )
    ),
    warnings: Object.freeze(Array.isArray(input.warnings) ? [...input.warnings] : []),
    blockers: Object.freeze(Array.isArray(input.blockers) ? [...input.blockers] : []),
    rationale: typeof input.rationale === "string" ? input.rationale.trim() : ""
  });
}

function toCoreTask(semanticTask, { projectId, missionId, createdAt } = {}) {
  const ancestry = {
    ...(semanticTask.ancestry || {}),
    ...(missionId ? { goalId: semanticTask.ancestry.goalId || missionId } : {})
  };
  return core.createTask({
    id: semanticTask.id,
    description: `${semanticTask.title}: ${semanticTask.objective}`,
    projectId,
    createdAt: createdAt || new Date().toISOString(),
    metadata: {
      semantic: semanticTask,
      ancestry: Object.freeze(ancestry)
    }
  });
}

function toCoreTaskGraph({ id, missionId, semanticTasks, metadata = {} }) {
  if (!id || typeof id !== "string") throw new TypeError("TaskGraph id is required");
  if (!missionId || typeof missionId !== "string") throw new TypeError("TaskGraph missionId is required");
  const tasksArray = semanticTasks || [];
  const coreTasks = tasksArray.map((st) => toCoreTask(st, { missionId }));
  const dependencies = deriveDependencies(tasksArray);

  return core.createTaskGraph({
    id,
    missionId,
    tasks: coreTasks,
    dependencies,
    metadata: {
      ...metadata,
      semantic: true
    }
  });
}

function fromCoreTaskGraph(coreGraph) {
  if (!coreGraph || coreGraph.kind !== "task_graph") {
    throw new TypeError("Input must be a Core TaskGraph entity");
  }
  const semanticTasks = (coreGraph.tasks || []).map((ct) => {
    if (ct.metadata && ct.metadata.semantic) {
      return createSemanticTask(ct.metadata.semantic);
    }
    return createSemanticTask({
      id: ct.id,
      title: ct.description.split(":")[0] || ct.id,
      objective: ct.description,
      dependsOn: (coreGraph.dependencies && coreGraph.dependencies[ct.id]) || []
    });
  });

  return Object.freeze({
    id: coreGraph.id,
    missionId: coreGraph.missionId,
    semanticTasks: Object.freeze(semanticTasks),
    metadata: coreGraph.metadata || {}
  });
}

module.exports = {
  TASK_RISK_LEVELS,
  TASK_COMPLEXITY_LEVELS,
  ENGINEERING_CAPABILITIES,
  PLANNING_MODES,
  deriveOutcomeContract,
  createSemanticTask,
  createPlanningAssumption,
  createTaskGraphProposal,
  toCoreTask,
  toCoreTaskGraph,
  fromCoreTaskGraph
};
