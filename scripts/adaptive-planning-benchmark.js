#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { MaestroApplication } = require("../runtime/application/maestro-application");
const { ContextEngine } = require("../runtime/context/context-engine");
const { SemanticPlanner } = require("../runtime/planner/semantic-planner");
const { planProgressively, summarizePlanningPair } = require("../runtime/resolution/progressive-planning");

function parseArgs(argv) {
  const options = {
    projectPath: process.cwd(),
    task: "",
    provider: "",
    model: "default",
    maxTokens: 8000,
    startStrategy: "targeted",
    controlRetries: 3,
    execute: false,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") { options.execute = true; continue; }
    if (arg === "--json") { options.json = true; continue; }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--project-path") options.projectPath = next;
    else if (arg === "--task") options.task = next;
    else if (arg === "--provider") options.provider = next;
    else if (arg === "--model") options.model = next;
    else if (arg === "--max-tokens") options.maxTokens = Number.parseInt(next, 10);
    else if (arg === "--start-strategy") options.startStrategy = next;
    else if (arg === "--control-retries") options.controlRetries = Number.parseInt(next, 10);
    else throw new Error(`Unknown parameter: ${arg}`);
    index += 1;
  }
  if (!options.task.trim()) throw new Error("--task is required");
  if (!options.provider.trim()) throw new Error("--provider is required");
  if (!options.execute) throw new Error("--execute is required because this benchmark makes real provider/model calls");
  if (!["targeted", "balanced", "deep"].includes(options.startStrategy)) throw new Error("--start-strategy must be targeted, balanced, or deep");
  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 100) throw new Error("--max-tokens must be an integer >= 100");
  if (!Number.isInteger(options.controlRetries) || options.controlRetries < 1 || options.controlRetries > 10) throw new Error("--control-retries must be between 1 and 10");
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const workspacePath = path.resolve(options.projectPath);
  const app = await new MaestroApplication({ projectRoot: workspacePath }).initialize();
  const pairId = `planning-${crypto.randomUUID()}`;
  const missionBrief = { id: pairId, objective: options.task, requirements: [], constraints: [], userDecisions: [] };
  const plannerTarget = { providerId: options.provider, model: options.model, local: options.provider === "opencode" };
  const providerOptions = { sandbox: "read-only", permissionMode: "read-only" };

  const controlContextEngine = new ContextEngine({ workspacePath, semanticRanker: null });
  const controlContext = await controlContextEngine.buildContext(options.task, options.maxTokens);
  const controlPlanner = new SemanticPlanner({
    application: app,
    plannerTarget,
    localOnly: options.provider === "opencode",
    maxRetries: options.controlRetries
  });
  const control = await controlPlanner.plan({
    missionBrief,
    taskRelevantContext: controlContext,
    missionId: pairId,
    allowFallback: true,
    workspacePath,
    providerOptions
  });

  const treatmentContextEngine = new ContextEngine({ workspacePath, semanticRanker: null });
  const treatmentPlanner = new SemanticPlanner({
    application: app,
    plannerTarget,
    localOnly: options.provider === "opencode",
    maxRetries: options.controlRetries
  });
  const treatment = await planProgressively({
    contextEngine: treatmentContextEngine,
    planner: treatmentPlanner,
    intent: options.task,
    maxTokens: options.maxTokens,
    missionBrief,
    missionId: pairId,
    experiment: { authorized: true, pairId, startStrategy: options.startStrategy },
    workspacePath,
    providerOptions
  });

  const report = {
    projectPath: "[redacted]",
    task: options.task,
    provider: options.provider,
    model: options.model,
    pairId,
    control: {
      planningMode: control.planningMode,
      planningTelemetry: control.planningTelemetry,
      context: controlContextEngine.getLastBuildMetrics()
    },
    treatment: {
      planningMode: treatment.planningMode,
      planningTelemetry: treatment.planningTelemetry,
      progressivePlanning: treatment.progressivePlanning
    },
    summary: summarizePlanningPair({ control, treatment })
  };

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Control calls: ${report.summary.controlModelCalls ?? "unavailable"}`);
    console.log(`Treatment calls: ${report.summary.treatmentModelCalls ?? "unavailable"}`);
    console.log(`Model-call savings: ${report.summary.modelCallSavings ?? "unavailable"}`);
    console.log(`Provider-token savings: ${report.summary.providerTokenSavings ?? "unavailable"}`);
    console.log(`Estimated prompt-token savings: ${report.summary.estimatedPromptTokenSavings ?? "unavailable"}`);
    console.log(`Treatment strategy: ${report.summary.treatmentSuccessStrategy || "fallback"}`);
  }
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
