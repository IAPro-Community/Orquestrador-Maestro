"use strict";

const {
  assertObject,
  capabilities,
  enumValue,
  optionalArray,
  optionalObject,
  optionalString,
  optionalText,
  optionalTimestamp,
  requiredString
} = require("./validation");

const RUN_STATUSES = Object.freeze(["pending", "running", "completed", "failed", "cancelled", "timed_out"]);
const STEP_STATUSES = Object.freeze(["pending", "running", "completed", "failed", "skipped", "cancelled"]);
const EXECUTION_STATUSES = Object.freeze(["pending", "running", "completed", "failed", "cancelled", "timed_out"]);
const VERIFICATION_STATUSES = Object.freeze(["pending", "running", "passed", "failed", "skipped"]);
const MISSION_STATUSES = Object.freeze(["draft", "planning", "awaiting_approval", "running", "blocked", "verifying", "consolidating", "completed", "failed", "cancelled"]);
const MISSION_MODES = Object.freeze(["direct", "guided", "team"]);
const ATTENTION_REQUEST_TYPES = Object.freeze(["QUESTION", "APPROVAL", "DECISION", "BLOCKER", "FAILURE", "CONFLICT", "SECURITY"]);

function entity(kind, properties) {
  return Object.freeze({ kind, ...properties });
}

function createTask(input) {
  assertObject(input, "task");
  return entity("task", {
    id: requiredString(input.id, "task.id"),
    description: requiredString(input.description, "task.description"),
    projectId: optionalString(input.projectId, "task.projectId"),
    createdAt: optionalTimestamp(input.createdAt, "task.createdAt"),
    metadata: optionalObject(input.metadata, "task.metadata")
  });
}

function createMission(input) {
  assertObject(input, "mission");
  return entity("mission", {
    id: requiredString(input.id, "mission.id"),
    projectId: requiredString(input.projectId, "mission.projectId"),
    objective: requiredString(input.objective, "mission.objective"),
    status: enumValue(input.status, "mission.status", MISSION_STATUSES, "draft"),
    mode: enumValue(input.mode, "mission.mode", MISSION_MODES, "guided"),
    plan: optionalObject(input.plan, "mission.plan"),
    createdAt: optionalTimestamp(input.createdAt, "mission.createdAt"),
    startedAt: optionalTimestamp(input.startedAt, "mission.startedAt"),
    completedAt: optionalTimestamp(input.completedAt, "mission.completedAt"),
    metadata: optionalObject(input.metadata, "mission.metadata")
  });
}

function createRun(input) {
  assertObject(input, "run");
  return entity("run", {
    id: requiredString(input.id, "run.id"),
    taskId: requiredString(input.taskId, "run.taskId"),
    status: enumValue(input.status, "run.status", RUN_STATUSES, "pending"),
    providerId: optionalString(input.providerId, "run.providerId"),
    startedAt: optionalTimestamp(input.startedAt, "run.startedAt"),
    completedAt: optionalTimestamp(input.completedAt, "run.completedAt"),
    metadata: optionalObject(input.metadata, "run.metadata")
  });
}

function createStep(input) {
  assertObject(input, "step");
  return entity("step", {
    id: requiredString(input.id, "step.id"),
    runId: requiredString(input.runId, "step.runId"),
    profileId: optionalString(input.profileId, "step.profileId"),
    status: enumValue(input.status, "step.status", STEP_STATUSES, "pending"),
    startedAt: optionalTimestamp(input.startedAt, "step.startedAt"),
    completedAt: optionalTimestamp(input.completedAt, "step.completedAt"),
    metadata: optionalObject(input.metadata, "step.metadata")
  });
}

function createExecution(input) {
  assertObject(input, "execution");
  return entity("execution", {
    id: requiredString(input.id, "execution.id"),
    runId: requiredString(input.runId, "execution.runId"),
    stepId: requiredString(input.stepId, "execution.stepId"),
    providerId: requiredString(input.providerId, "execution.providerId"),
    status: enumValue(input.status, "execution.status", EXECUTION_STATUSES, "pending"),
    startedAt: optionalTimestamp(input.startedAt, "execution.startedAt"),
    completedAt: optionalTimestamp(input.completedAt, "execution.completedAt"),
    metadata: optionalObject(input.metadata, "execution.metadata")
  });
}

function createArtifact(input) {
  assertObject(input, "artifact");
  return entity("artifact", {
    id: requiredString(input.id, "artifact.id"),
    runId: requiredString(input.runId, "artifact.runId"),
    type: requiredString(input.type, "artifact.type"),
    stepId: optionalString(input.stepId, "artifact.stepId"),
    name: optionalString(input.name, "artifact.name"),
    uri: optionalString(input.uri, "artifact.uri"),
    createdAt: optionalTimestamp(input.createdAt, "artifact.createdAt"),
    metadata: optionalObject(input.metadata, "artifact.metadata")
  });
}

function createVerification(input) {
  assertObject(input, "verification");
  return entity("verification", {
    id: requiredString(input.id, "verification.id"),
    runId: requiredString(input.runId, "verification.runId"),
    status: enumValue(input.status, "verification.status", VERIFICATION_STATUSES, "pending"),
    checks: optionalArray(input.checks, "verification.checks", createVerificationCheck),
    startedAt: optionalTimestamp(input.startedAt, "verification.startedAt"),
    completedAt: optionalTimestamp(input.completedAt, "verification.completedAt"),
    metadata: optionalObject(input.metadata, "verification.metadata")
  });
}

function createVerificationCheck(input) {
  assertObject(input, "verification check");
  const exitCode = input.exitCode;
  if (exitCode !== undefined && (!Number.isInteger(exitCode) || exitCode < 0)) {
    throw new TypeError("verification check.exitCode must be a non-negative integer");
  }
  if (input.durationMs !== undefined && (!Number.isFinite(input.durationMs) || input.durationMs < 0)) {
    throw new TypeError("verification check.durationMs must be a non-negative number");
  }

  return Object.freeze({
    name: requiredString(input.name, "verification check.name"),
    command: requiredString(input.command, "verification check.command"),
    exitCode,
    stdout: optionalText(input.stdout, "verification check.stdout"),
    stderr: optionalText(input.stderr, "verification check.stderr"),
    durationMs: input.durationMs
  });
}

function createProviderDescriptor(input) {
  assertObject(input, "provider descriptor");
  return entity("provider", {
    id: requiredString(input.id, "provider.id"),
    displayName: requiredString(input.displayName, "provider.displayName"),
    capabilities: capabilities(input.capabilities),
    version: optionalString(input.version, "provider.version"),
    metadata: optionalObject(input.metadata, "provider.metadata")
  });
}

function createExecutionProfile(input) {
  assertObject(input, "execution profile");
  return entity("execution_profile", {
    id: requiredString(input.id, "execution profile.id"),
    displayName: requiredString(input.displayName, "execution profile.displayName"),
    instructions: optionalString(input.instructions, "execution profile.instructions"),
    permissions: optionalObject(input.permissions, "execution profile.permissions"),
    defaultVerification: optionalArray(input.defaultVerification, "execution profile.defaultVerification", (item) => requiredString(item, "execution profile.defaultVerification item")),
    recommendedSkills: optionalArray(input.recommendedSkills, "execution profile.recommendedSkills", (item) => requiredString(item, "execution profile.recommendedSkills item")),
    metadata: optionalObject(input.metadata, "execution profile.metadata")
  });
}

function createExecutionPolicy(input) {
  assertObject(input, "execution policy");
  return entity("execution_policy", {
    id: requiredString(input.id, "execution policy.id"),
    displayName: requiredString(input.displayName, "execution policy.displayName"),
    requiredCapabilities: optionalArray(input.requiredCapabilities, "execution policy.requiredCapabilities", validateCapabilityName),
    timeoutMs: validateOptionalTimeout(input.timeoutMs),
    metadata: optionalObject(input.metadata, "execution policy.metadata")
  });
}

function validateCapabilityName(value) {
  const known = Object.keys(capabilities());
  const capability = requiredString(value, "execution policy.requiredCapabilities item");
  if (!known.includes(capability)) {
    throw new TypeError(`execution policy.requiredCapabilities item is not a known capability: ${capability}`);
  }
  return capability;
}

function validateOptionalTimeout(value) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError("execution policy.timeoutMs must be a positive integer");
  }
  return value;
}

function createProject(input) {
  assertObject(input, "project");
  return entity("project", {
    id: requiredString(input.id, "project.id"),
    workspaceRoot: requiredString(input.workspaceRoot, "project.workspaceRoot"),
    name: requiredString(input.name, "project.name")
  });
}

function createProjectSnapshot(input) {
  assertObject(input, "project snapshot");
  return entity("project_snapshot", {
    projectId: requiredString(input.projectId, "project snapshot.projectId"),
    languages: optionalArray(input.languages, "project snapshot.languages", (x) => requiredString(x, "language")),
    frameworks: optionalArray(input.frameworks, "project snapshot.frameworks", (x) => requiredString(x, "framework")),
    packageManagers: optionalArray(input.packageManagers, "project snapshot.packageManagers", (x) => requiredString(x, "package manager")),
    architecture: optionalString(input.architecture, "project snapshot.architecture"),
    frontend: optionalString(input.frontend, "project snapshot.frontend"),
    backend: optionalString(input.backend, "project snapshot.backend"),
    tests: optionalString(input.tests, "project snapshot.tests"),
    skills: optionalArray(input.skills, "project snapshot.skills", (x) => requiredString(x, "skill")),
    timestamp: optionalTimestamp(input.timestamp, "project snapshot.timestamp")
  });
}

function createIntentSession(input) {
  assertObject(input, "intent session");
  const readinessScore = input.readinessScore;
  if (readinessScore !== undefined && (!Number.isInteger(readinessScore) || readinessScore < 0 || readinessScore > 100)) {
    throw new TypeError("intent session.readinessScore must be an integer between 0 and 100");
  }
  return entity("intent_session", {
    id: requiredString(input.id, "intent session.id"),
    projectId: requiredString(input.projectId, "intent session.projectId"),
    rawIntent: requiredString(input.rawIntent, "intent session.rawIntent"),
    facts: optionalArray(input.facts, "intent session.facts", (x) => requiredString(x, "fact")),
    assumptions: optionalArray(input.assumptions, "intent session.assumptions", (x) => requiredString(x, "assumption")),
    questions: optionalArray(input.questions, "intent session.questions", (x) => requiredString(x, "question")),
    answers: optionalArray(input.answers, "intent session.answers", (x) => requiredString(x, "answer")),
    readinessScore,
    relevantContext: optionalObject(input.relevantContext, "intent session.relevantContext")
  });
}

function createTaskRelevantContext(input) {
  assertObject(input, "task relevant context");
  return entity("task_relevant_context", {
    intent: requiredString(input.intent, "task relevant context.intent"),
    items: optionalArray(input.items, "task relevant context.items", createContextItem)
  });
}

const CONTEXT_ITEM_KINDS = Object.freeze(["FACT", "INFERENCE", "ASSUMPTION", "USER_DECISION"]);

function createContextItem(input) {
  assertObject(input, "context item");
  const confidence = input.confidence;
  if (confidence !== undefined && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
    throw new TypeError("context item.confidence must be a number between 0 and 1");
  }
  const relevance = input.relevance;
  if (relevance !== undefined && (typeof relevance !== "number" || relevance < 0 || relevance > 1)) {
    throw new TypeError("context item.relevance must be a number between 0 and 1");
  }

  return Object.freeze({
    key: requiredString(input.key, "context item.key"),
    value: input.value, // allow any
    kind: enumValue(input.kind, "context item.kind", CONTEXT_ITEM_KINDS, "FACT"),
    confidence: confidence === undefined ? 1 : confidence,
    relevance: relevance === undefined ? 1 : relevance,
    sources: optionalArray(input.sources, "context item.sources", createSource)
  });
}

function createSource(input) {
  assertObject(input, "source");
  return Object.freeze({
    type: requiredString(input.type, "source.type"),
    path: optionalString(input.path, "source.path"),
    description: optionalString(input.description, "source.description")
  });
}

function createMissionBrief(input) {
  assertObject(input, "mission brief");
  return entity("mission_brief", {
    id: requiredString(input.id, "mission brief.id"),
    intentSessionId: requiredString(input.intentSessionId, "mission brief.intentSessionId"),
    objective: requiredString(input.objective, "mission brief.objective"),
    requirements: optionalArray(input.requirements, "mission brief.requirements", (x) => requiredString(x, "requirement")),
    userDecisions: optionalArray(input.userDecisions, "mission brief.userDecisions", (x) => requiredString(x, "decision")),
    constraints: optionalArray(input.constraints, "mission brief.constraints", (x) => requiredString(x, "constraint")),
    relevantContext: optionalString(input.relevantContext, "mission brief.relevantContext")
  });
}

function createTaskGraph(input) {
  assertObject(input, "task graph");
  return entity("task_graph", {
    id: requiredString(input.id, "task graph.id"),
    missionId: requiredString(input.missionId, "task graph.missionId"),
    tasks: optionalArray(input.tasks, "task graph.tasks", createTask),
    dependencies: optionalObject(input.dependencies, "task graph.dependencies"),
    metadata: optionalObject(input.metadata, "task graph.metadata")
  });
}

function createEvidence(input) {
  assertObject(input, "evidence");
  const confidence = input.confidence;
  if (confidence !== undefined && (!Number.isInteger(confidence) || confidence < 0 || confidence > 100)) {
    throw new TypeError("evidence.confidence must be an integer between 0 and 100");
  }
  return entity("evidence", {
    id: requiredString(input.id, "evidence.id"),
    taskId: requiredString(input.taskId, "evidence.taskId"),
    type: requiredString(input.type, "evidence.type"),
    content: requiredString(input.content, "evidence.content"),
    confidence
  });
}

function createAttentionRequest(input) {
  assertObject(input, "attention request");
  return entity("attention_request", {
    id: requiredString(input.id, "attention request.id"),
    type: enumValue(input.type, "attention request.type", ATTENTION_REQUEST_TYPES, "QUESTION"),
    message: requiredString(input.message, "attention request.message"),
    context: optionalString(input.context, "attention request.context"),
    status: enumValue(input.status, "attention request.status", ["pending", "resolved"], "pending")
  });
}

function createSkill(input) {
  assertObject(input, "skill");
  return entity("skill", {
    id: requiredString(input.id, "skill.id"),
    name: requiredString(input.name, "skill.name"),
    source: enumValue(input.source, "skill.source", ["maestro", "user", "project"], "project"),
    verification: enumValue(input.verification, "skill.verification", ["maestro_verified", "unverified"], "unverified"),
    routingHints: optionalObject(input.routingHints, "skill.routingHints")
  });
}

module.exports = {
  MISSION_MODES,
  MISSION_STATUSES,
  EXECUTION_STATUSES,
  RUN_STATUSES,
  STEP_STATUSES,
  VERIFICATION_STATUSES,
  createArtifact,
  createExecution,
  createExecutionPolicy,
  createExecutionProfile,
  createProviderDescriptor,
  createMission,
  createRun,
  createStep,
  createTask,
  createVerification,
  createVerificationCheck,
  createProject,
  createProjectSnapshot,
  createIntentSession,
  createTaskRelevantContext,
  createContextItem,
  createMissionBrief,
  createTaskGraph,
  createEvidence,
  createAttentionRequest,
  createSkill
};
