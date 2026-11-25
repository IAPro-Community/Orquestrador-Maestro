"use strict";

const fs = require("node:fs");
const {
  assertProjectPath,
  assertTaskId,
  assertLocalPolicy,
  atomicWrite,
  canonicalJson,
  digestLock,
  loadLock,
  parseOptions,
  resolveLockPath,
  resolveStatePath,
  stateStatusForStep
} = require("./workflow-utils.js");

function now() {
  return new Date().toISOString();
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) throw new Error(`State inexistente: ${statePath}`);
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    throw new Error(`State inválido: ${error.message}`);
  }
}

function validateState(state, lock) {
  assertTaskId(state.taskId);
  if (state.taskId !== lock.taskId || state.workflow !== lock.workflow) throw new Error("State não corresponde ao lock.");
  if (state.lockDigest !== digestLock(lock)) throw new Error("lock-drift: digest do state não corresponde ao lock.");
  const stepIds = lock.resolved.steps.map((step) => typeof step === "string" ? step : step.id);
  if (!stepIds.includes(state.currentStep)) throw new Error("State aponta para uma etapa inexistente no lock.");
  if (!Array.isArray(state.history) || state.history.length === 0) throw new Error("State inválido: history não pode ser vazio.");
  if (!Array.isArray(state.approvals) || typeof state.gates !== "object" || state.gates === null) throw new Error("State inválido: approvals e gates são obrigatórios.");
  for (const entry of state.history) {
    if (!entry || typeof entry.to !== "string" || typeof entry.action !== "string") throw new Error("State inválido: histórico malformado.");
  }
  return state;
}

function resolveContext(args, requireTask = true) {
  const options = parseOptions(args, ["--project-path", "--lockfile", "--task-id", "--kind", "--by", "--to-step"]);
  const projectRoot = assertProjectPath(options["--project-path"] || ".");
  const lockDestination = options["--lockfile"]
    ? resolveLockPath(projectRoot, options["--lockfile"], options["--task-id"] || "task/placeholder")
    : null;
  let lock;
  if (lockDestination) lock = loadLock(lockDestination.absolute);
  const taskId = options["--task-id"] || lock?.taskId;
  if (requireTask && !taskId) throw new Error("Informe --task-id ou --lockfile.");
  if (taskId) assertTaskId(taskId);
  return { options, projectRoot, lockDestination, taskId, lock };
}

function loadContext(args) {
  const context = resolveContext(args);
  const statePath = resolveStatePath(context.projectRoot, context.taskId);
  const state = readState(statePath.absolute);
  const lock = context.lock || loadLock(resolveLockPath(context.projectRoot, state.lockfile, context.taskId).absolute);
  validateState(state, lock);
  return { ...context, statePath, state, lock };
}

function init(args) {
  const context = resolveContext(args, false);
  if (!context.lockDestination) throw new Error("workflow-state init exige --lockfile.");
  const lock = context.lock || loadLock(context.lockDestination.absolute);
  const taskId = context.taskId || lock.taskId;
  assertTaskId(taskId);
  assertLocalPolicy(context.projectRoot);
  const statePath = resolveStatePath(context.projectRoot, taskId);
  if (fs.existsSync(statePath.absolute) && !context.options["--force"]) {
    throw new Error("State já existe; use --force para reinicializar explicitamente.");
  }
  const firstStep = lock.resolved.steps[0];
  const firstStepId = typeof firstStep === "string" ? firstStep : firstStep.id;
  const state = {
    version: 1,
    taskId,
    lockfile: context.lockDestination.relative,
    lockDigest: digestLock(lock),
    workflow: lock.workflow,
    currentStep: firstStepId,
    status: stateStatusForStep(firstStepId),
    attempt: 0,
    approvals: [],
    gates: Object.fromEntries(lock.resolved.gates.map((gate) => [gate, "pending"])),
    history: [{ from: null, to: firstStepId, action: "init", at: now() }]
  };
  atomicWrite(statePath.absolute, canonicalJson(state));
  console.log(`State inicializado: .local/orquestrador/workflow-state/${taskId.slice("task/".length)}.json`);
  return 0;
}

function get(args) {
  const context = loadContext(args);
  const json = context.options["--json"];
  console.log(json ? JSON.stringify(context.state, null, 2) : `${context.state.taskId}: ${context.state.currentStep} (${context.state.status})`);
  return 0;
}

function validate(args) {
  const context = loadContext(args);
  console.log(JSON.stringify({ valid: true, taskId: context.state.taskId, currentStep: context.state.currentStep, lockDigest: context.state.lockDigest }, null, 2));
  return 0;
}

function approvalExists(state, kind) {
  return state.approvals.some((approval) => approval.kind === kind && approval.status === "approved");
}

function approve(args) {
  const context = loadContext(args);
  const kind = context.options["--kind"];
  const by = context.options["--by"];
  if (!["plan", "review", "release", "side-effect"].includes(kind || "") || !by || /[\0\r\n]/.test(by)) {
    throw new Error("approve exige --kind plan|review|release|side-effect e --by seguro.");
  }
  const updated = { ...context.state, approvals: [...context.state.approvals, { kind, status: "approved", by, at: now() }] };
  atomicWrite(context.statePath.absolute, canonicalJson(updated));
  console.log(`Aprovação registrada: ${kind}`);
  return 0;
}

function advance(args) {
  const context = loadContext(args);
  const target = context.options["--to-step"];
  if (!target) throw new Error("advance exige --to-step.");
  const steps = context.lock.resolved.steps.map((step) => typeof step === "string" ? { id: step } : step);
  const currentIndex = steps.findIndex((step) => step.id === context.state.currentStep);
  const targetIndex = steps.findIndex((step) => step.id === target);
  if (targetIndex !== currentIndex + 1) throw new Error("Apenas a próxima etapa declarada pode ser avançada.");
  const targetStep = steps[targetIndex];
  if (targetStep.humanGate?.required && !approvalExists(context.state, targetStep.humanGate.approval)) {
    throw new Error(`Gate humano pendente: aprovação ${targetStep.humanGate.approval} necessária.`);
  }
  const updated = {
    ...context.state,
    currentStep: target,
    status: stateStatusForStep(target),
    attempt: target === context.state.currentStep ? context.state.attempt + 1 : 0,
    history: [...context.state.history, { from: context.state.currentStep, to: target, action: "advance", at: now() }]
  };
  atomicWrite(context.statePath.absolute, canonicalJson(updated));
  console.log(`State avançado: ${target}`);
  return 0;
}

function printHelp() {
  console.log(`Uso:
  orquestrador-maestro workflow-state init --lockfile FILE [--project-path PATH] [--task-id ID] [--force]
  orquestrador-maestro workflow-state get [--task-id ID | --lockfile FILE] [--project-path PATH] [--json]
  orquestrador-maestro workflow-state validate [--task-id ID | --lockfile FILE] [--project-path PATH]
  orquestrador-maestro workflow-state approve --kind plan|review|release|side-effect --by NOME [--task-id ID | --lockfile FILE] [--project-path PATH]
  orquestrador-maestro workflow-state advance --to-step STEP [--task-id ID | --lockfile FILE] [--project-path PATH]`);
}

function main(args) {
  const [subcommand = "help", ...rest] = args;
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printHelp();
    return 0;
  }
  if (subcommand === "init") return init(rest);
  if (subcommand === "get") return get(rest);
  if (subcommand === "validate") return validate(rest);
  if (subcommand === "approve") return approve(rest);
  if (subcommand === "advance") return advance(rest);
  throw new Error(`Subcomando de workflow-state desconhecido: ${subcommand}`);
}

module.exports = { main, validateState };
