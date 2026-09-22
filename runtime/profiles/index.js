"use strict";

const { createExecutionProfile, createExecutionPolicy } = require("../core");

const PROFILE_DEFINITIONS = Object.freeze({
  developer: { displayName: "Developer", defaultVerification: ["lint", "typecheck", "test", "build"] },
  architect: { displayName: "Architect", defaultVerification: [] },
  reviewer: { displayName: "Reviewer", defaultVerification: ["test"] },
  "guided-engineering": { displayName: "Guided Engineering", defaultVerification: ["lint", "typecheck", "test"], recommendedSkills: ["skill-repo-health", "skill-preflight", "skill-verification-before-completion"] },
  tester: { displayName: "Tester", defaultVerification: ["test"] },
  security: { displayName: "Security", defaultVerification: ["lint", "test"] },
  documentation: { displayName: "Documentation", defaultVerification: [] }
});

const POLICY_DEFINITIONS = Object.freeze({
  fast: { displayName: "Fast", timeoutMs: 300000 },
  standard: { displayName: "Standard", timeoutMs: 900000, requiredCapabilities: ["headless"] },
  deep: { displayName: "Deep", timeoutMs: 1800000, requiredCapabilities: ["headless"] },
  security: { displayName: "Security", timeoutMs: 1800000, requiredCapabilities: ["headless"] },
  multiagent: { displayName: "Multiagent", timeoutMs: 1800000, requiredCapabilities: ["headless"] }
});

const ROUTINE_GIT_PATTERNS = Object.freeze([
  /\bgit\s+(?:status|diff|add|commit|push|pull|fetch|checkout|switch|branch|tag|log|show)\b/iu,
  /\b(?:faça|faca|faz|fazer|crie|criar|gere|gerar|make|create|do)\s+(?:um\s+|uma\s+|o\s+|a\s+)?(?:git\s+)?commit\b/iu,
  /\bcommit(?:e|ar|a)?\s+(?:these|the|estas|essas|as|os)?\s*(?:changes|mudanças|mudancas|alterações|alteracoes)?\b/iu,
  /\b(?:suba|envie|mande|faça|faca|faz|fazer|do|make)\s+(?:o\s+|um\s+)?(?:git\s+)?push\b/iu
]);

function deriveDelegationContract({ description = "", policyId = "standard" } = {}) {
  const text = typeof description === "string" ? description.trim() : "";
  const routineGit = ROUTINE_GIT_PATTERNS.some((pattern) => pattern.test(text));
  if (routineGit) {
    return Object.freeze({
      mode: "solo",
      allowSubagents: false,
      maxSubagents: 0,
      reason: "routine-git-operation"
    });
  }
  if (policyId !== "multiagent") {
    return Object.freeze({
      mode: "solo",
      allowSubagents: false,
      maxSubagents: 0,
      reason: "solo-by-default"
    });
  }
  return Object.freeze({
    mode: "multiagent",
    allowSubagents: true,
    maxSubagents: 4,
    reason: "explicit-multiagent-policy"
  });
}

function getProfile(id) {
  const definition = PROFILE_DEFINITIONS[id];
  return definition ? createExecutionProfile({ id, ...definition }) : null;
}

function getPolicy(id) {
  const definition = POLICY_DEFINITIONS[id];
  return definition ? createExecutionPolicy({ id, ...definition }) : null;
}

module.exports = { getPolicy, getProfile, deriveDelegationContract, POLICY_DEFINITIONS, PROFILE_DEFINITIONS };
