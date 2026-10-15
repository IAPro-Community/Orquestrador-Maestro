"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveMaestroRoot } = require("../../config/maestro-paths");
const { classifyComplexity } = require("../../planner/complexity-gate");
const { collectRoutingSignals } = require("../../planner/routing-signals");
const { SkillRouterV3 } = require("../../planner/skill-router-v3");
const { buildCompactionCapsule } = require("./context-capsule");
const {
  closeLedger,
  readLedger,
  recordCompaction,
  recordPolicyInjection,
  recordRoute,
  recordToolDecision
} = require("./context-ledger");
const { approximateTokens, injectionBudget, trimToBudget } = require("./context-budget");
const { contextResponse, denyTool, preToolContext, rewriteTool } = require("./hook-response");
const { endSession, getSession, updateSession } = require("./session-state");
const { governToolUse } = require("./tool-governor");

const MODES = Object.freeze(["off", "observe", "optimize", "strict"]);

function resolveMode(value = process.env.MAESTRO_OPENAI_MODE) {
  const mode = String(value || "optimize").trim().toLowerCase();
  return MODES.includes(mode) ? mode : "optimize";
}

function hasV3SkillManifest(root) {
  try {
    const document = JSON.parse(fs.readFileSync(path.join(root, "SKILLS_MANIFEST.json"), "utf8"));
    return document.version === 3;
  } catch {
    return false;
  }
}

function resolveRouter() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const installedRoot = resolveMaestroRoot({ home });
  const bundledRoot = path.resolve(__dirname, "..", "..", "..", "orquestrador");
  const maestroRoot = hasV3SkillManifest(installedRoot) ? installedRoot : bundledRoot;
  return new SkillRouterV3({ maestroRoot });
}

function routePrompt(prompt, cwd, options = {}) {
  if (typeof options.route === "function") return options.route(prompt, cwd);
  const preliminary = classifyComplexity(prompt);
  const routingSignals = collectRoutingSignals(path.resolve(cwd || process.cwd()), {
    intent: prompt,
    memory: null
  });
  return resolveRouter().resolve(prompt, routingSignals);
}

function selectedSkillIds(result) {
  return (result?.allSkills || []).map((skill) => skill?.id).filter(Boolean);
}

function buildTurnContext(result, mode = "optimize") {
  const complexity = result?.complexity || {};
  const budget = complexity.budget || {};
  const skills = selectedSkillIds(result);
  const lines = [
    `Maestro policy: mode=${mode}; complexity=${complexity.level || "STANDARD"}; profile=${result?.profile || "standard"}; context<=${budget.maxContextTokens || result?.contextBudget || "unknown"}.`,
    `Skills=${skills.length ? skills.join(",") : "none"}; subagents=${budget.allowSubagents ? "allowed" : "not-authorized"}.`,
    "Use progressive disclosure: request Maestro context/skill only when needed; avoid speculative repository-wide reads."
  ];
  return lines.join("\n");
}

function buildSessionContext(source, session, mode, ledger) {
  if (source !== "compact") return "";
  if (ledger?.compactionCapsule?.text) return ledger.compactionCapsule.text;
  if (!session?.complexity) return "";
  return `Maestro resume: complexity=${session.complexity}; skills=${(session.selectedSkills || []).join(",") || "none"}; subagents=${session.allowSubagents ? "allowed" : "not-authorized"}; mode=${mode}.`;
}

function increment(value) {
  return Number.isFinite(value) ? value + 1 : 1;
}

function handleOpenAIHookEvent(event, options = {}) {
  const mode = resolveMode(options.mode);
  const pluginData = options.pluginData || process.env.PLUGIN_DATA || null;
  const eventName = String(event?.hook_event_name || "");
  const sessionId = event?.session_id || null;
  const turnId = event?.turn_id || null;
  const cwd = event?.cwd || process.cwd();
  const current = getSession(pluginData, sessionId) || {};
  const ledger = readLedger(pluginData, sessionId) || {};

  if (mode === "off") return {};

  if (eventName === "SessionStart") {
    const next = updateSession(pluginData, sessionId, {
      cwd,
      mode,
      source: event?.source || "startup",
      starts: increment(current.starts)
    });
    if (mode === "observe") return {};
    const context = buildSessionContext(event?.source, next, mode, ledger);
    return context ? contextResponse("SessionStart", context) : {};
  }

  if (eventName === "UserPromptSubmit") {
    const prompt = String(event?.prompt || "").trim();
    if (!prompt) return {};
    const routed = routePrompt(prompt, cwd, options);
    const complexity = routed?.complexity || {};
    const selectedSkills = selectedSkillIds(routed);
    const allowSubagents = Boolean(complexity.budget?.allowSubagents);
    const routeRecord = recordRoute(pluginData, sessionId, {
      cwd,
      turnId,
      prompt,
      mode,
      complexity: complexity.level || "STANDARD",
      profile: routed?.profile || "standard",
      contextBudget: complexity.budget?.maxContextTokens || routed?.contextBudget || null,
      selectedSkills,
      allowSubagents
    });
    const context = trimToBudget(buildTurnContext(routed, mode), injectionBudget(complexity.level));
    const tokens = approximateTokens(context);
    updateSession(pluginData, sessionId, {
      cwd,
      mode,
      turnId,
      complexity: complexity.level || "STANDARD",
      profile: routed?.profile || "standard",
      selectedSkills,
      allowSubagents,
      explicitMultiagent: Boolean(complexity.explicitMultiagent),
      prompts: increment(current.prompts),
      lastPolicyDigest: routeRecord.digest,
      lastInjectedTokens: routeRecord.repeated ? 0 : tokens,
      injectedTokensApprox: (Number(current.injectedTokensApprox) || 0) + (routeRecord.repeated ? 0 : tokens)
    });
    if (mode === "observe") return {};
    if (routeRecord.repeated) {
      recordPolicyInjection(pluginData, sessionId, { injected: false });
      return {};
    }
    recordPolicyInjection(pluginData, sessionId, { injected: true, approximateTokens: tokens });
    return contextResponse("UserPromptSubmit", context);
  }

  if (eventName === "PreToolUse") {
    const decision = governToolUse({
      toolName: event?.tool_name,
      toolInput: event?.tool_input,
      complexity: current.complexity || ledger.complexity || "STANDARD",
      allowSubagents: Boolean(current.allowSubagents ?? ledger.allowSubagents),
      mode
    });
    recordToolDecision(pluginData, sessionId, decision);
    if (mode === "observe") return {};
    if (decision.action === "deny") return denyTool(decision.reason);
    if (decision.action === "rewrite") return rewriteTool(decision.updatedInput);
    if (decision.action === "context") return preToolContext(decision.reason);
    return {};
  }

  if (eventName === "SubagentStart") {
    updateSession(pluginData, sessionId, { subagentsObserved: increment(current.subagentsObserved) });
    if (mode === "observe") return {};
    const scope = current.allowSubagents
      ? "Keep this subagent narrowly scoped to the delegated task and return concise evidence."
      : "This session did not budget subagent fan-out; keep this subagent minimal and do not spawn further agents.";
    return contextResponse("SubagentStart", scope);
  }

  if (eventName === "PreCompact") {
    const capsule = buildCompactionCapsule(readLedger(pluginData, sessionId) || {
      complexity: current.complexity,
      profile: current.profile,
      selectedSkills: current.selectedSkills,
      allowSubagents: current.allowSubagents
    });
    recordCompaction(pluginData, sessionId, capsule);
    updateSession(pluginData, sessionId, {
      compactionsStarted: increment(current.compactionsStarted),
      lastCompactionTokens: capsule.approximateTokens
    });
    return {};
  }

  if (eventName === "PostCompact") {
    updateSession(pluginData, sessionId, { compactionsCompleted: increment(current.compactionsCompleted) });
    return {};
  }

  if (eventName === "SessionEnd") {
    endSession(pluginData, sessionId);
    closeLedger(pluginData, sessionId);
    return {};
  }

  return {};
}

module.exports = {
  MODES,
  buildSessionContext,
  buildTurnContext,
  handleOpenAIHookEvent,
  resolveMode,
  routePrompt,
  selectedSkillIds
};
