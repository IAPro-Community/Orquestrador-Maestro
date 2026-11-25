"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { GraphValidator } = require("../planner/graph-validator");
const { createTaskGraphProposal } = require("../planner/task-graph-proposal");
const { validateStoredExecutableManifest } = require("./executable-manifest");
const { validateID, bad } = require("./submission-admission");
const { bindingFromRealGitWorktree, samePhysicalPath } = require("./workspace-authority");

// Durable submission contract v1: turns a reviewed plan plus explicit
// per-task provider assignments into a persisted, approval-bound executable
// manifest and a fenced admission ledger entry. This module NEVER dispatches
// a provider; the persistent worker owns dispatch (see submission-supervisor).
const SCHEMA_VERSION = 1;
const MAX_ARTIFACT_CHARS = 64000;
const MAX_TASKS = 32;
const ARTIFACT_ID = /^[a-zA-Z0-9._:-]+$/;
const TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MODEL_ID = /^[A-Za-z0-9._:/+-]{1,128}$/;
const SANDBOX = new Set(["none", "enabled", "read-only", "workspace-write"]);
// Deterministic v1 execution limits. The Goal Loop policy owns corrective
// iteration budgets; the manifest stays a single-attempt contract here.
const DEFAULT_TASK_MAX_ATTEMPTS = 1;
const DEFAULT_TASK_MAX_DURATION_MS = 1_800_000;
const DEFAULT_TASK_MAX_COST_USD = 0;

const hash = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

function invalidParams(message) {
  const error = new TypeError(message);
  error.code = "INVALID_SUBMISSION_PARAMS";
  return error;
}

function requireNonEmptyString(value, name, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw invalidParams(name + " must be a nonempty string of up to " + maxLength + " characters");
  }
  return value;
}

/**
 * Canonical digest over the approved semantic tasks. The same computation is
 * repeated by the approved-task resolver, so a manifest can never reference
 * task content that was not persisted by this exact plan identity.
 */
function canonicalPlanDigest(semanticTasks) {
  const payload = semanticTasks.map((task) => ({
    id: task.id,
    title: task.title,
    objective: task.objective,
    dependsOn: [...task.dependsOn],
    acceptanceCriteria: [...task.acceptanceCriteria]
  }));
  return hash(JSON.stringify(payload));
}

/**
 * The single source of executable content for one approved task. Dispatch
 * ports recompute both digests and must match the manifest binding.
 */
function approvedTaskContent(task) {
  const description = `${task.title}: ${task.objective}`;
  const acceptanceText = task.acceptanceCriteria
    .map((criterion) => String(criterion).trim())
    .filter(Boolean)
    .join("\n");
  return Object.freeze({ description, acceptanceText });
}

function validateArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw invalidParams("artifact is required");
  }
  const artifactId = requireNonEmptyString(artifact.id, "artifact.id", 128);
  if (!ARTIFACT_ID.test(artifactId)) {
    throw invalidParams("artifact.id contains unsafe characters");
  }
  if (!Number.isInteger(artifact.version) || artifact.version < 1 || artifact.version > 1000000) {
    throw invalidParams("artifact.version must be a positive integer");
  }
  const content = requireNonEmptyString(artifact.content, "artifact.content", MAX_ARTIFACT_CHARS);
  if (typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(artifact.sha256)) {
    throw invalidParams("artifact.sha256 must be a SHA-256 hex digest");
  }
  const digest = hash(content);
  if (digest !== artifact.sha256.toLowerCase()) {
    throw invalidParams("artifact.sha256 does not match the supplied artifact content");
  }
  return Object.freeze({ id: artifactId, version: artifact.version, sha256: digest });
}

function validateSubmissionPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || !Array.isArray(plan.tasks)) {
    throw invalidParams("plan.tasks must be an array");
  }
  if (JSON.stringify(plan).length > 65536 ||
      ["assumptions", "warnings", "blockers"].some((key) =>
        plan[key] !== undefined && (!Array.isArray(plan[key]) || plan[key].length > 32))) {
    throw invalidParams("plan metadata exceeds bounded submission limits");
  }
  if (plan.tasks.length < 1 || plan.tasks.length > MAX_TASKS) {
    throw invalidParams("plan must contain between 1 and " + MAX_TASKS + " tasks");
  }
  for (const [index, task] of plan.tasks.entries()) {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw invalidParams("plan.tasks[" + index + "] must be an object");
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
  let normalized;
  try {
    normalized = createTaskGraphProposal({ ...plan, planningMode: "local-ai" });
  } catch (error) {
    throw invalidParams("invalid task graph proposal: " + error.message);
  }
  let validation;
  try {
    validation = GraphValidator.validate(normalized);
  } catch (error) {
    throw invalidParams("invalid task graph: " + error.message);
  }
  if (!validation.valid || !validation.normalizedProposal?.tasks?.length) {
    throw bad("plan must pass Maestro DAG validation before durable submission", "PLAN_NOT_EXECUTABLE");
  }
  return validation.normalizedProposal.tasks;
}

function supportedSandbox(adapter, caps, requested) {
  if (requested === "none") return true;
  if (requested === "enabled") return adapter?.id === "agy" && caps.sandboxControl === true;
  if (requested === "read-only" || requested === "workspace-write") {
    return adapter?.id === "codex" && caps.sandboxControl === true;
  }
  return false;
}

async function validateAssignment({ raw, taskId, providers, tasks }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalidParams("assignment for task " + taskId + " must be an object");
  }
  const allowed = new Set(["taskId", "providerId", "model", "worktreePath", "sandbox"]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw invalidParams("Unexpected assignment field: " + key);
  }
  if (raw.taskId !== taskId) throw invalidParams("assignment taskId mismatch");
  if (typeof raw.providerId !== "string" || raw.providerId.length > 32) {
    throw invalidParams("assignment providerId is required");
  }
  if (raw.model !== undefined && (typeof raw.model !== "string" ||
      raw.model.length > 128 || !MODEL_ID.test(raw.model) || raw.model.includes(".."))) {
    throw invalidParams("Unsafe assignment model identifier");
  }
  if (!SANDBOX.has(raw.sandbox)) {
    throw invalidParams("Each assignment must select sandbox mode explicitly");
  }
  if (raw.worktreePath !== undefined &&
      (typeof raw.worktreePath !== "string" || raw.worktreePath.length > 4096)) {
    throw invalidParams("Unsafe assignment worktree path");
  }
  const adapter = providers?.get?.(raw.providerId) || null;
  if (!adapter) {
    throw bad("provider " + raw.providerId + " is not registered in this Maestro runtime",
      "PROVIDER_NOT_REGISTERED");
  }
  let capabilities = {};
  try {
    capabilities = (await adapter.capabilities()) || {};
  } catch {
    capabilities = {};
  }
  if (!supportedSandbox(adapter, capabilities, raw.sandbox)) {
    throw bad("provider " + raw.providerId + " does not support the requested sandbox mode",
      "SANDBOX_NOT_SUPPORTED");
  }
  if (raw.model && raw.model !== "default") {
    // v1 dispatch is certified for the provider default model only; a
    // specific model is accepted in previews but not in durable admission.
    throw bad("model-specific dispatch is not certified by the current adapters",
      "MODEL_LOCK_DISPATCH_UNSUPPORTED");
  }
  if (!tasks.some((task) => task.id === taskId)) {
    throw invalidParams("assignment references an unknown task");
  }
  return Object.freeze({
    taskId, providerId: raw.providerId,
    modelId: raw.model?.trim() || "default", sandbox: raw.sandbox,
    worktreePath: raw.worktreePath
  });
}

/**
 * Trusted server-side approval verifier. A receipt is self-verifying: its id
 * is the SHA-256 of its canonical payload, so a forged id cannot pass. Only
 * canonical identity fields bind the digest; approvedAt/approvedBy stay as
 * non-canonical metadata so a replayed submission keeps one stable digest.
 */
function canonicalApprovalPayload(receipt) {
  return JSON.stringify({
    schemaVersion: receipt.schemaVersion,
    projectId: receipt.projectId,
    manifestId: receipt.manifestId,
    manifestDigest: receipt.manifestDigest,
    planDigest: receipt.planDigest,
    artifactDigest: receipt.artifactDigest,
    decision: receipt.decision,
    tasks: receipt.tasks
  });
}

function buildApprovalReceipt({ projectId, manifest, approvedBy, approvedAt }) {
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    manifestId: manifest.id,
    manifestDigest: manifest.digest,
    planDigest: manifest.planDigest,
    artifactDigest: manifest.artifactDigest,
    decision: "approved",
    ...(typeof approvedBy === "string" && approvedBy.trim() && approvedBy.length <= 128
      ? { approvedBy: approvedBy.trim() } : {}),
    approvedAt,
    tasks: manifest.tasks.map((task) => ({
      taskId: task.taskId, promptDigest: task.promptDigest, acceptanceDigest: task.acceptanceDigest
    }))
  };
  return Object.freeze({ id: hash(canonicalApprovalPayload(receipt)), ...receipt });
}

function validateApprovalReceipt(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw bad("malformed approval receipt", "RUN_STORE_CORRUPTED");
  }
  const { id, ...payload } = row;
  if (payload.schemaVersion !== SCHEMA_VERSION ||
      typeof payload.projectId !== "string" || typeof payload.manifestId !== "string" ||
      typeof payload.manifestDigest !== "string" || typeof payload.planDigest !== "string" ||
      typeof payload.artifactDigest !== "string" || payload.decision !== "approved" ||
      typeof payload.approvedAt !== "string" || !Number.isFinite(Date.parse(payload.approvedAt)) ||
      !Array.isArray(payload.tasks) || payload.tasks.length < 1 || payload.tasks.length > MAX_TASKS) {
    throw bad("malformed approval receipt payload", "RUN_STORE_CORRUPTED");
  }
  for (const [key, name] of [["manifestDigest", "manifest"], ["planDigest", "plan"], ["artifactDigest", "artifact"]]) {
    if (!/^[a-f0-9]{64}$/.test(payload[key])) {
      throw bad("approval receipt " + name + " digest is invalid", "RUN_STORE_CORRUPTED");
    }
  }
  if (payload.approvedBy !== undefined &&
      (typeof payload.approvedBy !== "string" || payload.approvedBy.length > 128)) {
    throw bad("approval receipt approver identity is invalid", "RUN_STORE_CORRUPTED");
  }
  const taskIds = new Set();
  for (const task of payload.tasks) {
    if (!task || typeof task.taskId !== "string" || !TASK_ID.test(task.taskId) || taskIds.has(task.taskId) ||
        !/^[a-f0-9]{64}$/.test(task.promptDigest || "") ||
        !/^[a-f0-9]{64}$/.test(task.acceptanceDigest || "")) {
      throw bad("approval receipt task binding is invalid", "RUN_STORE_CORRUPTED");
    }
    taskIds.add(task.taskId);
  }
  const expected = hash(canonicalApprovalPayload({ ...payload, tasks: payload.tasks }));
  if (id !== expected) {
    throw bad("approval receipt digest mismatch", "RUN_STORE_CORRUPTED");
  }
  return Object.freeze({ id, ...payload });
}

function createTrustedApprovalVerifier({ store }) {
  if (!store?.getApprovalReceipt) {
    throw bad("persistent approval receipt store is required", "APPROVAL_NOT_VERIFIED");
  }
  return async function verifyApproval(subject) {
    if (!subject?.manifestId || !subject?.approvalDigest) return false;
    let receipt;
    try {
      receipt = validateApprovalReceipt(await store.getApprovalReceipt(subject.approvalDigest));
    } catch {
      return false;
    }
    // The supervisor's claim subject does not carry the immutable manifest
    // digest; resolve it from the persisted manifest so the receipt is still
    // bound to the exact approved DAG, never to a mutable plan digest.
    let manifestDigest = subject.manifestDigest;
    if (!manifestDigest) {
      try {
        const persisted = await store.getExecutableManifest(subject.manifestId);
        manifestDigest = validateStoredExecutableManifest(persisted)?.digest;
      } catch {
        return false;
      }
    }
    return receipt.manifestId === subject.manifestId &&
      receipt.manifestDigest === manifestDigest &&
      receipt.planDigest === subject.planDigest &&
      receipt.artifactDigest === subject.artifactDigest &&
      receipt.projectId === subject.projectId;
  };
}

async function resolveProjectIdForRoot({ store, projectRoot }) {
  const projects = await store.listProjects();
  const matches = [];
  for (const project of projects || []) {
    if (project?.path && samePhysicalPath(project.path, projectRoot)) matches.push(project.id);
  }
  if (matches.length !== 1) {
    throw bad("project root must match exactly one registered Maestro project",
      "PROJECT_SCOPE_MISMATCH");
  }
  return matches[0];
}

/**
 * Persist the approved task content server-side. Tasks are namespaced by the
 * plan digest, so the same plan replays idempotently and different plans can
 * never alias each other's executable content.
 */
function approvedPlanTaskId(projectId, planDigest, taskId) {
  return 'exec-' + hash(JSON.stringify([projectId, planDigest, taskId]));
}
async function persistExecutableTasks({ store, projectId, planDigest, semanticTasks }) {
  const persistedId = (taskId) => approvedPlanTaskId(projectId, planDigest, taskId);
  for (const task of semanticTasks) {
    const content = approvedTaskContent(task);
    await store.saveTask({
      id: persistedId(task.id),
      description: content.description,
      projectId,
      createdAt: new Date().toISOString(),
      metadata: Object.freeze({
        semantic: task,
        semanticTaskId: task.id,
        executablePlanDigest: planDigest,
        promptDigest: hash(content.description),
        acceptanceDigest: hash(content.acceptanceText)
      })
    });
  }
  return persistedId;
}

/**
 * Production approved-task resolver for the dispatch ports. Re-derives the
 * manifest binding from persisted state and verifies every digest before the
 * provider sees any content.
 */
function createApprovedTaskResolver({ store }) {
  if (!store?.getExecutableManifest || !store?.listTasks) {
    throw bad("persistent manifest and task store are required",
      "SUBMISSION_DISPATCH_UNAVAILABLE");
  }
  return async function resolveApprovedTask(subject) {
    const persisted = await store.getExecutableManifest(subject.manifestId);
    if (!persisted) throw bad("manifest unavailable", "EXECUTABLE_MANIFEST_NOT_FOUND");
    const manifest = validateStoredExecutableManifest(persisted);
    if (manifest.id !== subject.manifestId || manifest.digest !== subject.manifestDigest) {
      throw bad("manifest identity mismatch", "EXECUTABLE_MANIFEST_MISMATCH");
    }
    const persistedId = approvedPlanTaskId(manifest.projectId, manifest.planDigest, subject.taskId);
    const direct = await store.getTask?.(persistedId);
    const candidates = direct
      ? [direct]
      : ((await store.listTasks({ projectId: manifest.projectId })) || [])
          .filter((task) => task?.metadata?.executablePlanDigest === manifest.planDigest &&
            task?.metadata?.semanticTaskId === subject.taskId);
    if (candidates.length !== 1 || candidates[0]?.projectId !== manifest.projectId || candidates[0]?.metadata?.executablePlanDigest !== manifest.planDigest || candidates[0]?.metadata?.semantic?.id !== subject.taskId) {
      throw bad("approved task content is not uniquely resolvable",
        "EXECUTABLE_ARTIFACT_MISMATCH");
    }
    const content = approvedTaskContent(candidates[0].metadata.semantic);
    if (hash(content.description) !== subject.promptDigest ||
        hash(content.acceptanceText) !== subject.acceptanceDigest ||
        hash(content.description) !== candidates[0].metadata.promptDigest ||
        hash(content.acceptanceText) !== candidates[0].metadata.acceptanceDigest) {
      throw bad("approved executable artifact digest mismatch", "EXECUTABLE_ARTIFACT_MISMATCH");
    }
    return Object.freeze(content);
  };
}

/**
 * Durable admission entrypoint. Validates the reviewed plan and artifact,
 * binds real Git worktrees server-side, persists the immutable manifest and
 * the self-verifying approval receipt, then admits a fenced ledger entry.
 * Returns the durable ACK; execution is the worker's responsibility.
 */
async function submitExecutablePlan({
  store, providers, projectRoot, workspacePath, params
} = {}) {
  if (!store?.putExecutableManifest || !store?.saveApprovalReceipt || !store?.saveTask) {
    throw bad("canonical Maestro RunStore is required", "SUBMISSION_UNAVAILABLE");
  }
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw invalidParams("submission parameters must be an object");
  }
  const allowed = new Set(["clientKey", "artifact", "approvedModelUse", "plan", "assignments", "approval", "budget"]);
  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) throw invalidParams("Unknown submission parameter: " + key);
  }
  // Explicit, human-approved execution budget. Without one, corrective Goal
  // Loop iterations fail closed to the human decision (UNKNOWN cost is never
  // invented to unlock automation).
  const budget = params.budget === undefined
    ? { maxCostUSD: DEFAULT_TASK_MAX_COST_USD }
    : (() => {
      if (!params.budget || typeof params.budget !== "object" || Array.isArray(params.budget) ||
          Object.keys(params.budget).some((key) => key !== "maxCostUSD")) {
        throw invalidParams("budget must declare only maxCostUSD");
      }
      const maxCostUSD = params.budget.maxCostUSD;
      if (typeof maxCostUSD !== "number" || !Number.isFinite(maxCostUSD) || maxCostUSD < 0 || maxCostUSD > 100) {
        throw invalidParams("budget.maxCostUSD must be a finite USD limit in [0, 100]");
      }
      return { maxCostUSD };
    })();
  validateID(params.clientKey, "clientKey");
  if (params.approvedModelUse !== true) {
    throw bad("external model use must be explicitly approved for planning provenance",
      "MODEL_USE_NOT_APPROVED");
  }
  const artifact = validateArtifact(params.artifact);
  const semanticTasks = validateSubmissionPlan(params.plan);
  if (!Array.isArray(params.assignments) || params.assignments.length !== semanticTasks.length) {
    throw invalidParams("Every task requires exactly one explicitly selected provider");
  }
  if (!params.approval || params.approval.decision !== "approved") {
    throw bad("human approval decision is required for durable admission", "APPROVAL_NOT_VERIFIED");
  }
  const root = path.resolve(projectRoot || process.cwd());
  const resolvedWorkspace = path.resolve(workspacePath || root);
  const seen = new Set();
  const byTaskId = new Map(semanticTasks.map((task) => [task.id, task]));
  const assignments = [];
  for (const task of semanticTasks) {
    const raw = params.assignments.find((assignment) => assignment?.taskId === task.id);
    if (!raw || seen.has(task.id)) {
      throw invalidParams("Duplicate or missing task assignment: " + task.id);
    }
    seen.add(task.id);
    assignments.push(await validateAssignment({
      raw, taskId: task.id, providers, tasks: semanticTasks
    }));
  }
  if (seen.size !== semanticTasks.length || !semanticTasks.every((task) => byTaskId.has(task.id))) {
    throw invalidParams("Every task requires exactly one assignment");
  }

  const projectId = await resolveProjectIdForRoot({ store, projectRoot: root });
  // Bind every distinct worktree server-side. v1 reserves the canonical root
  // plus up to four additional worktrees atomically; independent tasks must
  // not share a worktree (enforced again by the manifest normalizer).
  const bindingsByPath = new Map();
  for (const assignment of assignments) {
    const target = assignment.worktreePath || resolvedWorkspace;
    if (!bindingsByPath.has(target)) {
      bindingsByPath.set(target, bindingFromRealGitWorktree({ projectRoot: root, workspacePath: target }));
    }
  }
  if (bindingsByPath.size > 5) {
    throw bad("multi-worktree submission is limited to five distinct worktrees",
      "MANIFEST_MULTI_WORKTREE_UNSUPPORTED");
  }
  const extraWorkspaces = [...bindingsByPath.keys()]
    .filter((target) => target !== resolvedWorkspace)
    .map((target) => ({ workspacePath: target }));
  const bindingFor = (assignment) =>
    bindingsByPath.get(assignment.worktreePath || resolvedWorkspace);

  const planDigest = canonicalPlanDigest(semanticTasks);
  const manifest = await store.putExecutableManifest({
    schemaVersion: SCHEMA_VERSION,
    projectId,
    planDigest,
    artifactDigest: artifact.sha256,
    maxCostUSD: budget.maxCostUSD,
    tasks: semanticTasks.map((task) => {
      const assignment = assignments.find((item) => item.taskId === task.id);
      const content = approvedTaskContent(task);
      const binding = bindingFor(assignment);
      return {
        taskId: task.id,
        dependsOn: [...task.dependsOn],
        providerId: assignment.providerId,
        modelId: assignment.modelId,
        workspaceFingerprint: binding.fingerprint,
        headCommit: binding.headCommit,
        branch: binding.branch,
        promptDigest: hash(content.description),
        acceptanceDigest: hash(content.acceptanceText),
        sandbox: assignment.sandbox,
        maxAttempts: DEFAULT_TASK_MAX_ATTEMPTS,
        maxDurationMs: DEFAULT_TASK_MAX_DURATION_MS,
        maxCostUSD: DEFAULT_TASK_MAX_COST_USD
      };
    })
  });

  const receipt = buildApprovalReceipt({
    projectId, manifest, approvedBy: params.approval.approvedBy, approvedAt: new Date().toISOString()
  });
  await store.saveApprovalReceipt(receipt);
  await persistExecutableTasks({ store, projectId, planDigest, semanticTasks });

  const { admitManifestBoundSubmission } = require("./manifest-admission");
  const admission = await admitManifestBoundSubmission({
    store, manifestId: manifest.id, projectRoot: root, workspacePath: resolvedWorkspace,
    clientKey: params.clientKey, approvalDigest: receipt.id,
    verifyApproval: createTrustedApprovalVerifier({ store }),
    ...(extraWorkspaces.length > 0 ? { extraWorkspaces } : {})
  });
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    submissionId: admission.submission.id,
    requestDigest: admission.submission.requestDigest,
    manifestId: manifest.id,
    manifestDigest: manifest.digest,
    approvalDigest: receipt.id,
    status: admission.submission.status,
    replayed: admission.replayed === true,
    workspaceFingerprint: bindingFor(assignments[0]).fingerprint,
    branch: bindingFor(assignments[0]).branch,
    headCommit: bindingFor(assignments[0]).headCommit
  });
}

module.exports = {
  SCHEMA_VERSION,
  canonicalPlanDigest,
  approvedPlanTaskId,
  approvedTaskContent,
  buildApprovalReceipt,
  validateApprovalReceipt,
  createTrustedApprovalVerifier,
  createApprovedTaskResolver,
  resolveProjectIdForRoot,
  submitExecutablePlan,
  validateArtifact,
  validateSubmissionPlan
};
