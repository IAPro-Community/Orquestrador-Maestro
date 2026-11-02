"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { GraphValidator } = require("../planner/graph-validator");
const { createTaskGraphProposal } = require("../planner/task-graph-proposal");
const { buildBrief } = require("../../orquestrador/bin/context-brief");

const MAX_ARTIFACT_CHARS = 64000;
const MAX_TASKS = 32;

function invalidParams(message) {
  const error = new TypeError(message);
  error.code = -32602;
  return error;
}

function nonEmptyString(value, name, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw invalidParams(name + " must be a nonempty string of up to " + maxLength + " characters");
  }
  return value;
}

function validatePlanPreview(params = {}, projectRoot) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw invalidParams("plan validation parameters must be an object");
  }
  if (params.projectPath !== undefined) {
    nonEmptyString(params.projectPath, "projectPath", 4096);
    if (path.resolve(params.projectPath) !== projectRoot) {
      throw invalidParams("projectPath must match the active Maestro Bridge project root");
    }
  }
  const artifact = params.artifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw invalidParams("artifact is required");
  }
  const artifactId = nonEmptyString(artifact.id, "artifact.id", 128);
  if (!/^[a-zA-Z0-9._:-]+$/.test(artifactId)) {
    throw invalidParams("artifact.id contains unsafe characters");
  }
  if (!Number.isInteger(artifact.version) || artifact.version < 1 || artifact.version > 1000000) {
    throw invalidParams("artifact.version must be a positive integer");
  }
  const content = nonEmptyString(artifact.content, "artifact.content", MAX_ARTIFACT_CHARS);
  if (typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(artifact.sha256)) {
    throw invalidParams("artifact.sha256 must be a SHA-256 hex digest");
  }
  const digest = crypto.createHash("sha256").update(content, "utf8").digest("hex");
  if (digest !== artifact.sha256.toLowerCase()) {
    throw invalidParams("artifact.sha256 does not match the supplied artifact content");
  }
  const plan = params.proposal;
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || !Array.isArray(plan.tasks)) {
    throw invalidParams("proposal.tasks must be an array");
  }
  if (plan.tasks.length < 1 || plan.tasks.length > MAX_TASKS) {
    throw invalidParams("proposal must contain between 1 and " + MAX_TASKS + " tasks");
  }
  for (const [index, task] of plan.tasks.entries()) {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw invalidParams("proposal.tasks[" + index + "] must be an object");
    }
    if (typeof task.title !== "string" || task.title.length > 240 ||
        typeof task.objective !== "string" || task.objective.length > 4000 ||
        !Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length < 1 ||
        task.acceptanceCriteria.length > 20 ||
        task.acceptanceCriteria.some((criterion) => typeof criterion !== "string" ||
          criterion.trim().length < 3 || criterion.length > 500)) {
      throw invalidParams("each task requires a bounded title, objective and concrete acceptance criteria");
    }
  }

  // The canonical Maestro context remains authoritative; this read does not
  // import or persist semantic memory in Nexus or in a second Maestro store.
  const canonicalContext = buildBrief({ projectPath: projectRoot, task: "", maxChars: 8000 });
  if (!canonicalContext?.manifest?.contentDigest) {
    throw new Error("Canonical Maestro context manifest unavailable");
  }

  let normalized;
  try {
    normalized = createTaskGraphProposal({ ...plan, planningMode: "local-ai" });
  } catch (error) {
    throw invalidParams("invalid task graph proposal: " + error.message);
  }
  const validation = GraphValidator.validate(normalized);
  // The result validates a supplied proposal; it MUST NOT be called a
  // generated Maestro plan. Execution and user approval are separate.
  return Object.freeze({
    schemaVersion: 1,
    authority: "MAESTRO",
    source: "caller-provided-proposal",
    reviewOnly: true,
    executable: false,
    requiresApproval: true,
    artifact: Object.freeze({
      id: artifactId, version: artifact.version, sha256: digest
    }),
    context: Object.freeze({
      manifestVersion: canonicalContext.manifest.version,
      contentDigest: canonicalContext.manifest.contentDigest
    }),
    validation: Object.freeze({
      valid: validation.valid,
      blockers: validation.blockers,
      warnings: validation.warnings
    }),
    tasks: validation.valid ? validation.normalizedProposal.tasks : null
  });
}

module.exports = { validatePlanPreview };
