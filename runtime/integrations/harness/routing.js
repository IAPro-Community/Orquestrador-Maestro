"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveMaestroRoot } = require("../../config/maestro-paths");
const { collectRoutingSignals } = require("../../planner/routing-signals");
const { SkillRouterV3 } = require("../../planner/skill-router-v3");

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
  const routingSignals = collectRoutingSignals(path.resolve(cwd || process.cwd()), {
    intent: prompt,
    memory: null,
    includeWorkspaceChanges: false
  });
  return resolveRouter().resolve(prompt, routingSignals);
}



// Model-facing projection of Router V3, not another router.
// Never include raw intent, rejected candidates, catalogs or workspace diff.
function compactNativeRoute(result) {
  const budget = result.complexity.budget;
  return {
    routingVersion: result.routingVersion,
    complexity: result.complexity.level,
    profile: result.profile,
    planningDepth: budget.planningDepth,
    verificationDepth: budget.verificationDepth,
    contextBudget: budget.maxContextTokens,
    allowSubagents: budget.allowSubagents,
    skills: (result.allSkills || []).map(({ id, path }) => ({ id, path })),
    estimatedSkillTokens: result.estimatedContextTokens,
    estimatedContextOverBudget: result.estimatedContextOverBudget
  };
}

module.exports = { compactNativeRoute, routePrompt, nativeRoutingGuidance };

// Advisory only. No provider calls, permission changes, raw intent persistence,
// session ownership, or continuation. No block for generic/mechanical turns.
function nativeRoutingGuidance(prompt, cwd, options = {}) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 16000 ||
      typeof cwd !== "string" || !path.isAbsolute(cwd)) return null;
  try {
    const route = compactNativeRoute(routePrompt(prompt, cwd, options));
    const skills = route.skills.map(s => s.id).filter(id => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/u.test(id)).slice(0, 5);
    if (!skills.length && !["COMPLEX", "DEEP"].includes(route.complexity)) return null;
    const complexity = ["MICRO", "SIMPLE", "STANDARD", "COMPLEX", "DEEP"].includes(route.complexity) ? route.complexity : "STANDARD";
    return `Maestro route: ${complexity}; skills=${skills.join(",") || "none"}; subagents=${route.allowSubagents === true ? "eligible only if explicitly authorized" : "not authorized"}. Reuse this route; load only needed selected skills, verify proportionally, and keep the native session.`;
  } catch {
    return null;
  }
}
