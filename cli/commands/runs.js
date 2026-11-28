"use strict";

// Runs + usage commands extracted verbatim from bin/orquestrador-maestro.js.

const crypto = require("node:crypto");
const { path, rootDir, parseRuntimeArgs, createRuntimeApplication } = require("../shared-context");

async function handleRunsCommand(args) {
  const subcommand = args[0];
  if (subcommand === "worker") {
    const options = parseRuntimeArgs(args.slice(1), ["--project-path", "--interval", "--concurrency"], ["--once"]);
    if (options.values.length) {
      throw new Error("Uso: maestro runs worker --project-path PATH [--interval MS] [--concurrency N] [--once]");
    }
    const interval = options.interval === undefined ? 1000 : Number(options.interval);
    if (!Number.isInteger(interval) || interval < 50 || interval > 60000) {
      throw new Error("--interval deve ser um inteiro entre 50 e 60000.");
    }
    const concurrency = options.concurrency === undefined ? 1 : Number(options.concurrency);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      throw new Error("--concurrency deve ser um inteiro entre 1 e 8.");
    }
    const projectRoot = path.resolve(options.projectPath);
    const app = await createRuntimeApplication(projectRoot);
    const { createSubmissionWorker } = require(path.join(rootDir, "runtime", "runs", "submission-worker"));
    const worker = createSubmissionWorker({
      application: app, store: app.store, projectRoot,
      workerId: "worker-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
      concurrency, pollIntervalMs: interval,
      onError: (event) => console.error(JSON.stringify({ type: "worker.error", ...event }))
    });
    if (options.once === true) {
      const result = await worker.step();
      console.log(JSON.stringify({ ...result, diagnostics: worker.diagnostics() }, null, 2));
      return result.healthy ? 0 : 1;
    }
    let stopping = false;
    const shutdown = () => { if (!stopping) { stopping = true; void worker.stop(); } };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    console.log(JSON.stringify({ workerId: worker.workerId, concurrency, pollIntervalMs: interval }, null, 2));
    await worker.run();
    return 0;
  }
  if (subcommand === "admissions" || subcommand === "reconcile") {
    const options = parseRuntimeArgs(args.slice(1), ["--project-path", "--limit"], ["--apply"]);
    if (options.values.length || (options.apply && subcommand !== "reconcile")) {
      throw new Error("Uso: maestro runs admissions|reconcile [--project-path PATH] [--limit N] [--apply somente reconcile]");
    }
    const limitText = options.limit === undefined ? "100" : String(options.limit);
    const limit = /^\d+$/.test(limitText) ? Number(limitText) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("--limit deve ser um inteiro entre 1 e 200.");
    }
    const app = await createRuntimeApplication(options.projectPath);
    const { inspectRunAdmissions, reconcileExpiredRunAdmissions } =
      require(path.join(rootDir, "runtime", "runs", "reconciliation"));
    const result = subcommand === "admissions"
      ? await inspectRunAdmissions({ store: app.store, limit })
      : await reconcileExpiredRunAdmissions({ store: app.store, limit, apply: options.apply === true });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  const options = parseRuntimeArgs(args, ["--project-path"]);
  if (options.values.length > 0) throw new Error("Uso: maestro runs [--project-path PATH]");
  console.log(JSON.stringify(await (await createRuntimeApplication(options.projectPath)).listRuns({ projectPath: options.projectPath }), null, 2));
  return 0;
}

function formatTokens(value) {
  return value === null || value === undefined ? "unavailable" : String(value);
}

async function handleUsageCommand(args) {
  const options = parseRuntimeArgs(args, ["--project-path", "--limit", "--provider", "--model", "--branch", "--project"], ["--json"]);
  if (options.values.length > 0) throw new Error("Uso: maestro usage [--project-path PATH] [--limit N] [--provider TOOL] [--model MODEL] [--branch BRANCH] [--project ID] [--json]");
  const limitRaw = options.limit !== undefined ? String(options.limit) : undefined;
  const limit = limitRaw !== undefined
    ? (/^\d+$/.test(limitRaw) ? Number.parseInt(limitRaw, 10) : NaN)
    : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("--limit deve ser um inteiro entre 1 e 200.");
  }
  const app = await createRuntimeApplication(options.projectPath);
  const runs = await app.listRuns({ projectPath: options.projectPath });
  const rows = [];
  for (const run of runs) {
    const telemetry = run.metadata?.cognitiveTelemetry || {};
    const task = run.taskId ? await app.getTask(run.taskId).catch(() => null) : null;
    const tool = telemetry.tool || run.providerId || "unknown";
    const provider = telemetry.provider || "unknown";
    const model = telemetry.model || "unknown";
    const branch = telemetry.branch || "unknown";
    const project = task?.projectId || telemetry.projectId || "unknown";
    const known = (value) => {
      if (value === undefined || value === null) return null;
      const text = String(value);
      return text.toLowerCase() === "unknown" ? null : text;
    };
    const knownTool = known(tool);
    const knownProvider = known(provider);
    const knownModel = known(model);
    const knownBranch = known(branch);
    const knownProject = known(project);
    if (options.provider && !(knownTool === options.provider || knownProvider === options.provider)) continue;
    if (options.model && !(knownModel && knownModel.toLowerCase().includes(String(options.model).toLowerCase()))) continue;
    if (options.branch && knownBranch !== options.branch) continue;
    if (options.project && knownProject !== options.project) continue;
    rows.push({
      run: run.id,
      project,
      branch,
      tool,
      provider,
      model,
      status: run.status,
      primaryCalls: telemetry.primaryCalls ?? "unavailable",
      reviewCalls: telemetry.reviewCalls ?? "unavailable",
      modelCalls: telemetry.modelCalls ?? "unavailable",
      inputTokens: telemetry.tokenInput ?? null,
      outputTokens: telemetry.tokenOutput ?? null,
      cachedInputTokens: telemetry.cachedInputTokens ?? null,
      tokenSource: telemetry.tokenSource || "unavailable",
      usageScope: telemetry.usageScope || "unknown",
      childAgentsObserved: telemetry.childAgentsObserved ?? 0,
      anonymousAgentEventsObserved: telemetry.anonymousAgentEventsObserved ?? 0,
      topologyExposed: telemetry.topologyExposed ?? "unknown",
      topologyVisibility: telemetry.topologyVisibility || "unavailable",
      durationMs: telemetry.durationMs ?? null
    });
  }
  const limited = rows.slice(-limit);
  if (options.json) {
    console.log(JSON.stringify(limited, null, 2));
    return 0;
  }
  if (limited.length === 0) {
    console.log("No runs recorded for this project.");
    return 0;
  }
  for (const row of limited) {
    console.log([
      `Run: ${row.run}`,
      `Project: ${row.project}`,
      `Branch: ${row.branch}`,
      `Tool: ${row.tool}`,
      `Provider: ${row.provider}`,
      `Model: ${row.model}`,
      `Primary calls: ${row.primaryCalls}`,
      `Review calls: ${row.reviewCalls}`,
      `Child agents observed: ${row.childAgentsObserved}`,
      `Topology: ${row.topologyVisibility}${row.topologyVisibility === "unavailable" ? " (0 observed does not mean no subagents)" : ""}`,
      `Input tokens: ${formatTokens(row.inputTokens)}`,
      `Cached: ${formatTokens(row.cachedInputTokens)}`,
      `Output: ${formatTokens(row.outputTokens)}`,
      `Token source: ${row.tokenSource} (${row.usageScope})`,
      ""
    ].join("\n"));
  }
  return 0;
}

module.exports = { handleRunsCommand, handleUsageCommand };
