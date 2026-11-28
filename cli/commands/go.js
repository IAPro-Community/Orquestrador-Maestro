"use strict";

// Go/planning extracted verbatim from bin/orquestrador-maestro.js.

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const {
  path, rootDir, packageJson, parseRuntimeArgs, createRuntimeApplication,
  resolveMaestroRoot, Memory, hasV3SkillManifest
} = require("../shared-context");

async function handleGoCommand(args, planningOnly = false) {
  const options = parseRuntimeArgs(args, ["--project-path", "--provider", "--fallback-providers", "--interviewer", "--model", "--max-cost", "--max-parallel", "--profile", "--interaction", "--resolution-mode", "--router-version", "--complexity"], ["--auto", "--plan"]);
  const description = options.values.join(" ").trim();
  if (!description) throw new Error('Informe a intenção: orquestrador-maestro go "tarefa"');

  const core = require(path.join(rootDir, "runtime", "core"));
  const { IntentRouter } = require(path.join(rootDir, "runtime", "planner", "intent-router"));
  const { SkillRouterV3 } = require(path.join(rootDir, "runtime", "planner", "skill-router-v3"));
  const { SemanticPlanner } = require(path.join(rootDir, "runtime", "planner", "semantic-planner"));
  const { PlanApprovalGate } = require(path.join(rootDir, "runtime", "planner", "plan-approval-gate"));
  const { LegacyExecutionProjection } = require(path.join(rootDir, "runtime", "planner", "legacy-execution-projection"));
  const { formatTasks } = require(path.join(rootDir, "runtime", "planner", "task-formatter"));
  const { LaneExecutor } = require(path.join(rootDir, "runtime", "planner", "lane-executor"));
  planningOnly = Boolean(planningOnly || options.plan);

  const workspacePath = path.resolve(options.projectPath || process.cwd());
  const app = await createRuntimeApplication(workspacePath);
  const benchmarkMarkerNonce = process.env.MAESTRO_BENCHMARK_MARKER_NONCE || "";
  const benchmarkUsageRequested = process.env.MAESTRO_BENCHMARK_USAGE === "1";
  if (benchmarkUsageRequested && !/^[A-Za-z0-9-]{16,128}$/u.test(benchmarkMarkerNonce)) {
    throw new Error("BENCHMARK_MARKER_NONCE_INVALID: benchmark token metering requires an authenticated marker nonce");
  }
  const { MissionUsageMeter } = require(path.join(rootDir, "runtime", "telemetry", "mission-usage-meter"));
  const missionUsageMeter = new MissionUsageMeter();
  missionUsageMeter.instrumentRegistry(app.providers);
  const resolutionMode = options.resolutionMode || "shadow";
  if (!["shadow", "advisory"].includes(resolutionMode)) {
    throw new Error("--resolution-mode aceita apenas shadow ou advisory; enforce permanece bloqueado pelo promotion gate.");
  }

  const p = require("@clack/prompts");
  const notifier = require("node-notifier");
  p.intro("◆ Orquestrador Maestro");

  const updateTitle = (title) => process.stdout.write(`\x1b]0;Maestro: ${title}\x07`);
  updateTitle("Inicializando...");

  // Fase 1: Classificação automática via skills
  const s = p.spinner();
  s.start("Classificando intenção");
  const routerV2 = new IntentRouter({});
  const installedRouterRoot = resolveMaestroRoot({ home: process.env.HOME || process.env.USERPROFILE || os.homedir() });
  const bundledRouterRoot = path.join(rootDir, "orquestrador");
  const routerV3 = new SkillRouterV3({
    maestroRoot: hasV3SkillManifest(installedRouterRoot)
      ? installedRouterRoot
      : bundledRouterRoot
  });
  const requestedRouterVersion = String(options.routerVersion || process.env.MAESTRO_ROUTER_VERSION || "3");
  if (!["2", "3"].includes(requestedRouterVersion)) {
    throw new Error("--router-version aceita apenas 2 ou 3.");
  }
  const { evaluateRouterShadow } = require(path.join(rootDir, "runtime", "planner", "router-shadow"));
  const { collectRoutingSignals } = require(path.join(rootDir, "runtime", "planner", "routing-signals"));
  const { classifyComplexity: classifyRoutingComplexity } = require(path.join(rootDir, "runtime", "planner", "complexity-gate"));
  const preliminaryComplexity = classifyRoutingComplexity(description, {
    overrideLevel: options.complexity || undefined
  });
  const routingSignals = collectRoutingSignals(workspacePath, {
    intent: description,
    memory: ["COMPLEX", "DEEP"].includes(preliminaryComplexity.level) ? new Memory() : null
  });
  const routingEvaluation = evaluateRouterShadow({
    intent: description,
    routerV2,
    routerV3,
    activeVersion: requestedRouterVersion,
    options: {
      ...routingSignals,
      overrideLevel: options.complexity || undefined
    }
  });
  const resolvedV2 = routingEvaluation.resolvedV2;
  const resolvedV3 = routingEvaluation.resolvedV3;
  const resolved = routingEvaluation.resolved;
  const routingShadow = routingEvaluation.shadow;

  if (resolved.primarySkill) {
    const skillsList = [resolved.primarySkill, ...resolved.chainedSkills].map(sk => sk.id).join(", ");
    const complexityLabel = requestedRouterVersion === "3" ? `, Complexity: ${resolvedV3.complexity.level}` : "";
    s.stop(`Intenção classificada: ${skillsList} (Router: v${requestedRouterVersion}, Profile: ${resolved.profile}${complexityLabel})`);
  } else {
    s.stop(`Nenhuma skill específica detectada — usando modo genérico (Router: v${requestedRouterVersion})`);
  }

  // Instancia a IntentSession localmente
  let session;
  if (!options.auto) {
    session = await app.startIntentSession({ workspacePath, rawIntent: description });
  }

  // Fase 2: Exploração do codebase
  updateTitle("Explorando codebase...");
  s.start("Explorando codebase local");
  const { ContextEngine } = require(path.join(rootDir, "runtime", "context", "context-engine"));
  const { SemanticRanker } = require(path.join(rootDir, "runtime", "context", "semantic-ranker"));

  const semanticRanker = new SemanticRanker(app, { localOnly: false });
  const contextEngine = new ContextEngine({ workspacePath, semanticRanker });
  const routingContextBudget = requestedRouterVersion === "3"
    ? resolvedV3.contextBudget
    : 8000;
  const relevantContext = await contextEngine.buildContext(description, routingContextBudget, { resolutionMode });

  s.stop(`Codebase explorada. Itens relevantes encontrados: ${relevantContext.items.length}`);

  if (session) {
    session = await app.updateIntentSession(session.id, { relevantContext });
  }

  // Fase 3: Entrevista dinâmica (ou batch)
  updateTitle("Refinamento...");
  const { AiInterviewer } = require(path.join(rootDir, "runtime", "planner", "ai-interviewer"));
  const interviewer = new AiInterviewer({
    resolvedSkills: resolved.allSkills,
    preflightFacts: relevantContext.items.reduce((acc, item) => ({...acc, [item.key]: item.value}), {}),
    application: app,
    intent: description,
    aiProvider: options.interviewer
  });

  const spec = options.auto
    ? await interviewer.runBatch()
    : await interviewer.runInteractive();

  // Fallback interviewers may return per-dimension answers as plain strings;
  // the MissionBrief contract requires string arrays.
  const normalizeList = (value) => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string" && entry.trim() !== "");
    return typeof value === "string" && value.trim() !== "" ? [value] : [];
  };

  let approvedBrief = null;
  if (session) {
    approvedBrief = await app.approveMissionBrief(session.id, {
      objective: spec.answers?.intent || description,
      requirements: normalizeList(spec.answers?.requirements),
      userDecisions: normalizeList(spec.answers?.userDecisions),
      constraints: normalizeList(spec.answers?.constraints),
      relevantContext: JSON.stringify(spec.answers)
    });
  } else {
    approvedBrief = core.createMissionBrief({
      id: `brief-${crypto.randomUUID()}`,
      intentSessionId: `session-${crypto.randomUUID()}`,
      objective: spec.answers?.intent || description,
      requirements: normalizeList(spec.answers?.requirements),
      userDecisions: normalizeList(spec.answers?.userDecisions),
      constraints: normalizeList(spec.answers?.constraints),
      relevantContext: JSON.stringify(spec.answers)
    });
  }

  // Fase 4: Planejamento semântico
  updateTitle("Montando plano de engenharia...");
  s.start("Montando plano de engenharia");

  const providers = await app.listProviders();
  const availableProviders = providers.filter((p) => p.installed).map((p) => p.id);
  const selectedProviderId = options.provider || (availableProviders.includes("opencode") ? "opencode" : availableProviders[0]);

  if (!selectedProviderId) {
    s.stop("Nenhum provedor de execução disponível.");
    throw new Error("MISSING_EXECUTION_TARGET: No installed provider available for execution");
  }

  const selectedModel = options.model || "default";
  const planner = new SemanticPlanner({
    application: app,
    plannerTarget: { providerId: selectedProviderId, model: selectedModel, local: selectedProviderId === "opencode" },
    localOnly: selectedProviderId === "opencode"
  });

  // Create the canonical Mission only after the execution target is known, but
  // before planning, so TaskGraph, approvals, runtime Tasks and Proof share one
  // missionId without leaving orphan planning Missions on provider discovery failure.
  const mission = await app.createMission({
    workspacePath,
    objective: approvedBrief.objective,
    status: "planning",
    startedAt: new Date().toISOString(),
    metadata: {
      missionBriefId: approvedBrief.id,
      routing: routingShadow
    }
  });

  const adaptivePolicyId = process.env.MAESTRO_ADAPTIVE_POLICY_ID || "";
  const adaptivePolicyFingerprint = process.env.MAESTRO_ADAPTIVE_POLICY_FINGERPRINT || "";
  const adaptivePairId = process.env.MAESTRO_ADAPTIVE_PAIR_ID || "";
  const adaptiveRequested = Boolean(adaptivePolicyId || adaptivePolicyFingerprint || adaptivePairId);
  let planResult;

  try {
  if (adaptiveRequested) {
    const { POLICY_IDENTITIES } = require(path.join(rootDir, "runtime", "resolution", "policy-identity"));
    const { planProgressively } = require(path.join(rootDir, "runtime", "resolution", "progressive-planning"));
    const expected = POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3;
    if (adaptivePolicyId !== expected.id || adaptivePolicyFingerprint !== expected.fingerprint) {
      throw new Error("ADAPTIVE_POLICY_IDENTITY_MISMATCH: benchmark policy identity does not match the runtime V3 contract");
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(adaptivePairId)) {
      throw new Error("ADAPTIVE_PAIR_ID_INVALID: a non-sensitive benchmark pairId is required");
    }

    planResult = await planProgressively({
      contextEngine,
      planner,
      intent: description,
      missionBrief: approvedBrief,
      missionId: mission.id,
      resolvedSkills: resolved.allSkills,
      experiment: { authorized: true, pairId: adaptivePairId, startStrategy: "targeted" },
      workspacePath
    });

    if (!benchmarkMarkerNonce) throw new Error("BENCHMARK_MARKER_NONCE_REQUIRED: adaptive benchmark confirmation requires a nonce");
    console.log(`MAESTRO_ADAPTIVE_POLICY=${JSON.stringify({
      nonce: benchmarkMarkerNonce,
      policyId: expected.id,
      policyFingerprint: expected.fingerprint,
      pairId: adaptivePairId,
      successStrategy: planResult.progressivePlanning?.successStrategy || null,
      fallbackUsed: planResult.progressivePlanning?.fallbackUsed === true
    })}`);
  } else {
    planResult = await planner.plan({
      missionBrief: approvedBrief,
      missionId: mission.id,
      taskRelevantContext: relevantContext,
      resolvedSkills: resolved.allSkills,
      allowFallback: true,
      workspacePath
    });
  }
  } catch (error) {
    await app.updateMission(mission.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      metadata: {
        ...(mission.metadata || {}),
        failureStage: "planning",
        failureCode: typeof error?.code === "string" ? error.code : "PLANNING_FAILED"
      }
    });
    throw error;
  }

  const { TaskGraphPersistence } = require(path.join(rootDir, "runtime", "planner", "task-graph-persistence"));
  const { PlanPersistenceHooks } = require(path.join(rootDir, "runtime", "planner", "plan-persistence-hooks"));
  const graphs = new TaskGraphPersistence({ store: app.store });
  const project = await app.inspectProject({ projectPath: workspacePath });
  const persistenceHooks = new PlanPersistenceHooks({
    graphs,
    getGraphInput: () => ({
      graphId: planResult.taskGraph.id,
      projectId: project.id,
      planningMode: planResult.planningMode,
      tasks: planResult.taskGraph.tasks.map((task) => task.metadata?.semantic || task)
    })
  });

  const explicitFallbackProviders = String(options.fallbackProviders || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index && value !== selectedProviderId);
  const executionTarget = {
    providerId: selectedProviderId,
    model: selectedModel,
    providerFallbacks: explicitFallbackProviders
  };
  let tasks = planResult.taskGraph.tasks.map((st) =>
    LegacyExecutionProjection.projectTask(st.metadata?.semantic || st, { executionTarget })
  );

  s.stop(`Plano de engenharia montado (${tasks.length} tarefas, modo: ${planResult.planningMode})`);

  const maxWidth = process.stdout.columns || 80;
  p.note(formatTasks(tasks, maxWidth), "Plano de Engenharia");

  // Fase 4.5: Plan Approval Gate
  try {
  if (options.auto) {
    const autoEval = PlanApprovalGate.evaluateAutoApproval({
      validationResult: { valid: true, blockers: [] },
      planningMode: planResult.planningMode
    }, { autoFallbackAllowed: false });

    if (!autoEval.approved) {
      await persistenceHooks.onRejected({ missionId: mission.id, taskGraphId: planResult.taskGraph.id, approval: autoEval });
      await app.attentionProducers.humanApprovalRequest({ missionId: mission.id, taskGraphId: planResult.taskGraph.id, evalResult: autoEval, projectId: project.id });
      await app.updateMission(mission.id, { status: "blocked", metadata: { ...(mission.metadata || {}), approvalBlock: autoEval.reason } });
      p.cancel(`Execução automática rejeitada: ${autoEval.reason}`);
      return 1;
    }
    await persistenceHooks.onApproved({ missionId: mission.id, taskGraphId: planResult.taskGraph.id, approval: autoEval });
    if (planningOnly) {
      await app.updateMission(mission.id, { status: "awaiting_approval" });
      s.stop("Plano aprovado");
      updateTitle("Plano aprovado");
      p.outro("◆ Plano de engenharia aprovado — nenhuma execução será realizada (modo plan)");
      return 0;
    }
  } else {
    let planApproved = false;
    while (!planApproved) {
      const action = await p.select({
        message: "Como deseja prosseguir com o plano?",
        options: [
          { value: "aprovar", label: "Aprovar plano de engenharia" },
          { value: "inspecionar", label: "Inspecionar critérios de aceite" },
          { value: "refinar", label: "Refinar missão (Retornar ao M2)" },
          { value: "cancelar", label: "Cancelar operação" }
        ]
      });

      if (p.isCancel(action) || action === "cancelar") {
        await app.updateMission(mission.id, { status: "cancelled", completedAt: new Date().toISOString() });
        p.cancel("Operação cancelada pelo usuário.");
        return 0;
      } else if (action === "aprovar") {
        const humanApproval = PlanApprovalGate.recordHumanApproval({ taskGraphId: planResult.taskGraph.id, userDecision: "approved" });
        await persistenceHooks.onApproved({ missionId: mission.id, taskGraphId: planResult.taskGraph.id, approval: humanApproval });
        planApproved = true;
        if (planningOnly) {
          await app.updateMission(mission.id, { status: "awaiting_approval" });
          s.stop("Plano aprovado");
          updateTitle("Plano aprovado");
          p.outro("◆ Plano de engenharia aprovado — nenhuma execução será realizada (modo plan)");
          return 0;
        }
      } else if (action === "inspecionar") {
        const details = planResult.taskGraph.tasks.map(t => {
          const s = t.metadata?.semantic || t;
          return `• ${s.title}\n  Objetivo: ${s.objective}\n  Critérios: ${(s.acceptanceCriteria || []).join(", ") || "Padrão"}`;
        }).join("\n\n");
        p.note(details, "Detalhes das Tarefas");
      } else if (action === "refinar") {
        await app.updateMission(mission.id, { status: "cancelled", completedAt: new Date().toISOString(), metadata: { ...(mission.metadata || {}), reason: "refinement-requested" } });
        p.cancel("Retornando ao refinamento de missão.");
        return 0;
      }
    }
  }
  } catch (error) {
    await app.updateMission(mission.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      metadata: {
        ...(mission.metadata || {}),
        failureStage: "approval",
        failureCode: typeof error?.code === "string" ? error.code : "PLAN_APPROVAL_FAILED"
      }
    });
    throw error;
  }

  // Fase 5: Execução
  updateTitle("Executando tarefas...");
  await app.updateMission(mission.id, { status: "running" });
  const executor = new LaneExecutor({
    application: app,
    maxParallel: parseInt(options.maxParallel, 10) || 3,
    executionProfile: options.profile,
    interactionProfile: options.interaction,
    resolutionMode
  });
  const { TaskLifecycleMonitor } = require(path.join(rootDir, "runtime", "planner", "task-lifecycle-monitor"));
  const lifecycleMonitor = TaskLifecycleMonitor.attach({
    executor,
    app,
    graphs,
    store: app.store,
    missionId: mission.id,
    projectId: project.id,
    graphId: planResult.taskGraph.id
  });

  const runningTasks = new Set();
  const updateSpinner = () => {
    if (runningTasks.size === 0) {
      s.message("Aguardando tarefas...");
    } else {
      const runningNames = Array.from(runningTasks).join(", ");
      s.message(`Executando (${runningTasks.size}/${tasks.length}): ${runningNames}`);
    }
  };

  executor.on("task.started", (e) => {
    runningTasks.add(e.id);
    updateSpinner();
    p.log.info(`▶ Iniciando: ${e.label} — ${e.provider}+${e.model ? e.model.split("/").pop() : "default"}`);
  });

  executor.on("task.completed", (e) => {
    runningTasks.delete(e.id);
    updateSpinner();
    p.log.success(`✓ Concluído: ${e.label}`);
  });

  executor.on("task.failed", (e) => {
    runningTasks.delete(e.id);
    updateSpinner();
    p.log.error(`✗ Falha: ${e.label}: ${e.error}`);
  });

  s.start("Inicializando execução...");
  let results;
  try {
    results = await executor.execute(tasks, mission.id);
    s.stop("Execução concluída");
  } catch (error) {
    await app.updateMission(mission.id, {
      status: "failed",
      completedAt: new Date().toISOString(),
      metadata: {
        ...(mission.metadata || {}),
        failureStage: "execution",
        failureCode: typeof error?.code === "string" ? error.code : "EXECUTION_FAILED"
      }
    });
    s.stop("Execução interrompida");
    throw error;
  } finally {
    lifecycleMonitor.detach();
  }

  const { deriveMissionResolution } = require(path.join(rootDir, "runtime", "resolution"));
  const missionCompletedAt = new Date().toISOString();
  const missionResolution = deriveMissionResolution(results, {
    objective: mission.objective,
    now: missionCompletedAt
  });
  const missionStatus = missionResolution.status;
  const missionUsage = missionUsageMeter.snapshot();
  const resultEntries = Object.values(results);
  const telemetryValues = resultEntries.map((entry) => entry?.result?.run?.metadata?.cognitiveTelemetry || null);
  const numericAggregate = (field) => telemetryValues.length > 0 && telemetryValues.every((value) => Number.isInteger(value?.[field]))
    ? telemetryValues.reduce((sum, value) => sum + value[field], 0)
    : null;
  const providerSwitches = resultEntries.reduce((sum, entry) => sum + (entry?.result?.handoff?.providerSwitches || 0), 0);
  const automaticRetries = numericAggregate("automaticRetries");
  const escalations = resultEntries.length > 0 && resultEntries.every((entry) => Number.isInteger(entry?.result?.run?.metadata?.resolution?.escalation?.count))
    ? resultEntries.reduce((sum, entry) => sum + entry.result.run.metadata.resolution.escalation.count, 0)
    : null;
  const firstPassKnown = resultEntries.every((entry) => {
    const run = entry?.result?.run;
    return entry?.resolutionState === "validated" || run?.metadata?.resolution?.outcome?.state === "validated"
      ? Number.isInteger(entry?.result?.handoff?.providerSwitches ?? 0)
        && Number.isInteger(run?.metadata?.cognitiveTelemetry?.automaticRetries)
        && Number.isInteger(run?.metadata?.resolution?.escalation?.count)
      : true;
  });
  const firstPassValidatedTaskCount = firstPassKnown
    ? resultEntries.filter((entry) => {
      const run = entry?.result?.run;
      const validated = entry?.resolutionState === "validated" || run?.metadata?.resolution?.outcome?.state === "validated";
      return validated
        && (entry?.result?.handoff?.providerSwitches || 0) === 0
        && run.metadata.cognitiveTelemetry.automaticRetries === 0
        && run.metadata.resolution.escalation.count === 0;
    }).length
    : null;
  const missionCognitiveTelemetry = Object.freeze({
    schemaVersion: 1,
    scope: "mission",
    usage: missionUsage,
    taskCount: missionResolution.summary.tasks,
    validatedTaskCount: missionResolution.summary.validatedTasks,
    firstPassValidatedTaskCount,
    failedTaskCount: missionResolution.summary.failedTasks,
    blockedTaskCount: missionResolution.summary.blockedTasks,
    needsAttentionTaskCount: missionResolution.summary.needsAttentionTasks,
    providerSwitches,
    automaticRetries,
    escalations,
    tokensToValidatedOutcome: missionResolution.state === "validated" && missionUsage.complete === true ? missionUsage.totalTokens : null,
    tokenMetricCompleteness: missionUsage.complete === true ? "complete" : "unavailable"
  });
  await app.updateMission(mission.id, {
    status: missionStatus,
    completedAt: ["completed", "failed", "blocked"].includes(missionStatus) ? missionCompletedAt : undefined,
    metadata: {
      ...(mission.metadata || {}),
      resolution: missionResolution,
      cognitiveTelemetry: missionCognitiveTelemetry
    }
  });

  if (benchmarkUsageRequested) {
    console.log(`MAESTRO_MISSION_USAGE=${JSON.stringify({
      nonce: benchmarkMarkerNonce,
      ...missionUsage,
      resolution: {
        state: missionResolution.state,
        taskCount: missionResolution.summary.tasks,
        validatedTaskCount: missionResolution.summary.validatedTasks,
        firstPassValidatedTaskCount,
        failedTaskCount: missionResolution.summary.failedTasks,
        blockedTaskCount: missionResolution.summary.blockedTasks,
        needsAttentionTaskCount: missionResolution.summary.needsAttentionTasks,
        providerSwitches,
        automaticRetries,
        escalations,
        tokensToValidatedOutcome: missionCognitiveTelemetry.tokensToValidatedOutcome
      }
    })}`);
  }

  if (missionResolution.state !== "validated") {
    updateTitle(missionResolution.state === "failed" ? "Concluído (com falhas)" : "Atenção necessária");
    const reason = missionResolution.state === "failed"
      ? "Missão concluída com falhas."
      : "Missão interrompida: existem tarefas não validadas.";
    notifier.notify({ title: "Maestro CLI", message: reason, sound: true });
    p.outro(`◆ Missão não validada (${missionResolution.state}): ${missionResolution.reason}`);
    return 1;
  }

  updateTitle("Concluído!");
  notifier.notify({ title: "Maestro CLI", message: "Missão validada com sucesso! 🚀", sound: true });
  p.outro("◆ Missão validada com sucesso! 🚀");
  return 0;
}


module.exports = { handleGoCommand };
