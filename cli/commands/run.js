"use strict";

// Run commands extracted verbatim from bin/orquestrador-maestro.js.

const { path, rootDir, parseRuntimeArgs, createRuntimeApplication } = require("../shared-context");

async function handleRunCommand(args) {
  const [subcommand, ...rest] = args;
  if (subcommand === "report") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    const runId = options.values[0];
    if (!runId || options.values.length !== 1) throw new Error("Uso: maestro run report <id> [--project-path PATH]");
    const app = await createRuntimeApplication(options.projectPath);
    const project = await app.inspectProject({ projectPath: app.projectRoot });
    const { buildRunReport } = require(path.join(rootDir, "runtime", "runs", "run-report"));
    const report = await buildRunReport({ store: app.store, runId, projectId: project.id });
    if (!report) throw new Error("Run não encontrado no projeto ativo.");
    console.log(JSON.stringify(report, null, 2)); return 0;
  }
  if (subcommand === "show" || subcommand === "inspect") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    const runId = options.values[0];
    if (!runId || options.values.length !== 1) throw new Error("Uso: maestro run inspect <id> [--project-path PATH]");
    const inspection = await (await createRuntimeApplication(options.projectPath)).inspectRun(runId);
    if (!inspection) throw new Error(`Run nao encontrado: ${runId}`);
    console.log(JSON.stringify(inspection, null, 2)); return 0;
  }
  if (subcommand === "cancel") {
    const options = parseRuntimeArgs(rest, ["--project-path"]);
    const runId = options.values[0];
    if (!runId || options.values.length !== 1) throw new Error("Uso: maestro run cancel <id> [--project-path PATH]");
    const cancelled = await (await createRuntimeApplication(options.projectPath)).cancelRun(runId);
    if (!cancelled) throw new Error(`Run ativo nao encontrado: ${runId}`);
    console.log(`Cancelamento solicitado para ${runId}.`); return 0;
  }
  const options = parseRuntimeArgs(args, ["--provider", "--fallback-providers", "--profile", "--policy", "--workspace", "--project-path", "--model", "--mode", "--agent", "--sandbox", "--interaction", "--resolution-mode"]);
  const description = options.values.join(" ").trim();
  if (!description) throw new Error("Informe a tarefa: maestro run [opcoes] \"tarefa\"");
  const app = await createRuntimeApplication(options.projectPath);
  const providerFallbacks = String(options.fallbackProviders || "").split(",").map((value) => value.trim()).filter(Boolean);
  const resolutionMode = options.resolutionMode || "shadow";
  if (!["shadow", "advisory"].includes(resolutionMode)) {
    throw new Error("--resolution-mode aceita apenas shadow ou advisory; enforce permanece bloqueado pelo promotion gate.");
  }
  const request = {
    description, providerId: options.provider, providerFallbacks, profileId: options.profile, policyId: options.policy,
    workspacePath: options.workspace || options.projectPath, model: options.model, mode: options.mode, agent: options.agent,
    sandbox: options.sandbox, interactionProfile: options.interaction, resolutionMode
  };
  const outcome = providerFallbacks.length > 0
    ? await app.executeTaskWithHandoff(request)
    : await app.executeRun(request);
  console.log(JSON.stringify({ run: outcome.run, verification: outcome.verification, changes: outcome.changes }, null, 2));
  const { isValidatedRunSuccess } = require(path.join(rootDir, "runtime", "resolution", "resolution-state"));
  return isValidatedRunSuccess(outcome.run) ? 0 : 1;
}

module.exports = { handleRunCommand };
