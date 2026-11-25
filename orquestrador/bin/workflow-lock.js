"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  assertProjectPath,
  assertTaskId,
  atomicWrite,
  canonicalJson,
  digestLock,
  loadLock,
  loadManifest,
  loadWorkflow,
  parseOptions,
  resolveLockPath
} = require("./workflow-utils.js");

function collectSourceRefs(projectRoot) {
  const candidates = [
    "AGENTS.md",
    "DEV/CONTEXT.md",
    "DEV/SPECS/ACTIVE.md",
    "DEV/HANDOFF.md"
  ];
  return candidates.filter((relative) => fs.existsSync(path.join(projectRoot, relative)));
}

function buildLock(projectRoot, taskId, workflowName) {
  assertTaskId(taskId);
  const workflow = loadWorkflow(workflowName);
  const manifest = loadManifest();
  const lock = {
    version: 1,
    schema: "orquestrador/WORKFLOW_LOCK_SCHEMA.json",
    taskId,
    workflow: workflowName,
    defaultsExpanded: true,
    sourceRefs: {
      projectInstructions: collectSourceRefs(projectRoot).filter((item) => item === "AGENTS.md"),
      dev: collectSourceRefs(projectRoot).filter((item) => item.startsWith("DEV/"))
    },
    contractRefs: {
      globalContract: ["orquestrador/rules.md", "orquestrador/maestro.md", "orquestrador/PERSISTENCE.md"],
      workflowSchema: `orquestrador/WORKFLOW_SCHEMAS.json#/workflows/${workflowName}`,
      skillsManifest: "orquestrador/SKILLS_MANIFEST.json"
    },
    resolved: {
      phases: workflow.phases,
      steps: workflow.steps,
      gates: workflow.gates,
      artifacts: workflow.phases.filter((phase) => typeof phase === "object" && phase.artifact).map((phase) => ({ path: `DEV/${phase.artifact}`, kind: phase.phase || phase.id })),
      skillRefs: [],
      adapterArtifacts: []
    },
    provenance: {
      evidence: [`workflow:${workflowName}`, "skills-manifest:defaults-expanded"],
      steward: manifest.defaults?.provenance?.steward || "orquestrador-maestro",
      reviewedAt: manifest.defaults?.provenance?.reviewedAt || "unknown"
    }
  };
  lock.lockDigest = digestLock(lock);
  return lock;
}

function generate(args) {
  const options = parseOptions(args, ["--project-path", "--task-id", "--workflow", "--out"]);
  const projectRoot = assertProjectPath(options["--project-path"] || ".");
  const taskId = options["--task-id"];
  const workflowName = options["--workflow"] || "plan-build-verify";
  if (!taskId) throw new Error("workflow-lock generate exige --task-id.");
  const destination = resolveLockPath(projectRoot, options["--out"], taskId);
  if (fs.existsSync(destination.absolute) && !options["--force"]) {
    throw new Error("Lock já existe; use --force para sobrescrever explicitamente.");
  }
  const lock = buildLock(projectRoot, taskId, workflowName);
  atomicWrite(destination.absolute, canonicalJson(lock));
  console.log(`Lock gerado: ${destination.relative}`);
  return 0;
}

function validate(args) {
  const options = parseOptions(args, ["--project-path", "--lockfile"]);
  const projectRoot = assertProjectPath(options["--project-path"] || ".");
  if (!options["--lockfile"]) throw new Error("workflow-lock validate exige --lockfile.");
  const destination = resolveLockPath(projectRoot, options["--lockfile"], "task/placeholder");
  const lock = loadLock(destination.absolute);
  console.log(JSON.stringify({ valid: true, taskId: lock.taskId, workflow: lock.workflow, lockDigest: lock.lockDigest }, null, 2));
  return 0;
}

function printHelp() {
  console.log(`Uso:
  orquestrador-maestro workflow-lock generate --task-id task/<slug> [--project-path PATH] [--workflow NAME] [--out FILE] [--force]
  orquestrador-maestro workflow-lock validate --lockfile FILE [--project-path PATH]`);
}

function main(args) {
  const [subcommand = "help", ...rest] = args;
  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printHelp();
    return 0;
  }
  if (subcommand === "generate") return generate(rest);
  if (subcommand === "validate") return validate(rest);
  throw new Error(`Subcomando de workflow-lock desconhecido: ${subcommand}`);
}

module.exports = { main, buildLock };
