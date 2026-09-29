"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveMaestroRoot } = require("../../config/maestro-paths");
const { classifyComplexity } = require("../../planner/complexity-gate");
const { collectRoutingSignals } = require("../../planner/routing-signals");
const { SkillRouterV3 } = require("../../planner/skill-router-v3");
const { approximateTokens, injectionBudget, trimToBudget } = require("./context-budget");
const { contextResponse, denyTool, preToolContext } = require("./hook-response");
const { endSession, getSession, updateSession } = require("./session-state");

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
    "Maestro turn policy:",
    `- mode=${mode}; complexity=${complexity.level || "STANDARD"}; profile=${result?.profile || "standard"}.`,
    `- core context budget <= ${budget.maxContextTokens || result?.contextBudget || "unknown"} tokens; selected skills: ${skills.length ? skills.join(", ") : "none"}.`,
    `- subagents: ${budget.allowSubagents ? "allowed by current budget" : "not authorized by current budget"}.`,
    "- Keep the working set minimal; read additional files only when needed.",
    "- Do not create a Mission for a trivial request. Preserve native Codex/Work behavior.",
    skills.length
      ? "- Load only the selected Maestro skill instructions when they are available."
      : "- Do not load Maestro skills speculatively."
  ];
  return lines.join("\n");
}

function buildSessionContext(source, session, mode) {
  const lines = [
    `Maestro Desktop integration active (mode=${mode}).`,
    "Use complexity-aware scope and avoid speculative context loading."
  ];
  if (source === "compact" && session?.complexity) {
    lines.push(
      `Rehydrate only the last Maestro policy: complexity=${session.complexity}; selected skills=${(session.selectedSkills || []).join(", ") || "none"}; subagents=${session.allowSubagents ? "allowed" : "not authorized"}.`
    );
  }
  return lines.join("\n");
}

function increment(value) {
  return Number.isFinite(value) ? value + 1 : 1;
}

function handleOpenAIHookEvent(event, options = {}) {
  const mode = resolveMode(options.mode);
  const pluginData = options.pluginData || process.env.PLUGIN_DATA || null;
  const eventName = String(event?.hook_event_name || "");
  const sessionId = event?.session_id || null;
  const cwd = event?.cwd || process.cwd();
  const current = getSession(pluginData, sessionId) || {};

  if (mode === "off") return {};

  if (eventName === "SessionStart") {
    const next = updateSession(pluginData, sessionId, {
      cwd,
      mode,
      source: event?.source || "startup",
      starts: increment(current.starts)
    });
    if (mode === "observe") return {};
    return contextResponse("SessionStart", buildSessionContext(event?.source, next, mode));
  }

  if (eventName === "UserPromptSubmit") {
    const prompt = String(event?.prompt || "").trim();
    if (!prompt) return {};
    const routed = routePrompt(prompt, cwd, options);
    const complexity = routed?.complexity || {};
    const selectedSkills = selectedSkillIds(routed);
    const context = trimToBudget(buildTurnContext(routed, mode), injectionBudget(complexity.level));
    updateSession(pluginData, sessionId, {
      cwd,
      mode,
      complexity: complexity.level || "STANDARD",
      profile: routed?.profile || "standard",
      selectedSkills,
      allowSubagents: Boolean(complexity.budget?.allowSubagents),
      explicitMultiagent: Boolean(complexity.explicitMultiagent),
      prompts: increment(current.prompts),
      lastInjectedTokens: approximateTokens(context),
      injectedTokensApprox: (Number(current.injectedTokensApprox) || 0) + approximateTokens(context)
    });
    if (mode === "observe") return {};
    return contextResponse("UserPromptSubmit", context);
  }

  if (eventName === "PreToolUse" && ["Agent", "spawn_agent"].includes(String(event?.tool_name || ""))) {
    if (current.allowSubagents) return {};
    const level = String(current.complexity || "STANDARD").toUpperCase();
    const reason = `Maestro budget for ${level} does not authorize subagents for this turn. Continue in the current agent unless the user explicitly requests multi-agent execution.`;
    if (mode === "strict" || (mode === "optimize" && ["MICRO", "SIMPLE"].includes(level))) {
      return denyTool(reason);
    }
    return mode === "optimize" ? preToolContext(reason) : {};
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
    updateSession(pluginData, sessionId, { compactionsStarted: increment(current.compactionsStarted) });
    return {};
  }

  if (eventName === "PostCompact") {
    updateSession(pluginData, sessionId, { compactionsCompleted: increment(current.compactionsCompleted) });
    return {};
  }

  if (eventName === "SessionEnd") {
    endSession(pluginData, sessionId);
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
