"use strict";

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

module.exports = { compactNativeRoute };
