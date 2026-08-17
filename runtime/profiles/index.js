"use strict";

const { createExecutionProfile, createExecutionPolicy } = require("../core");

const PROFILE_DEFINITIONS = Object.freeze({
  developer: { displayName: "Developer", defaultVerification: ["lint", "typecheck", "test", "build"] },
  architect: { displayName: "Architect", defaultVerification: [] },
  reviewer: { displayName: "Reviewer", defaultVerification: ["test"] },
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

function getProfile(id) {
  const definition = PROFILE_DEFINITIONS[id];
  return definition ? createExecutionProfile({ id, ...definition }) : null;
}

function getPolicy(id) {
  const definition = POLICY_DEFINITIONS[id];
  return definition ? createExecutionPolicy({ id, ...definition }) : null;
}

module.exports = { getPolicy, getProfile, POLICY_DEFINITIONS, PROFILE_DEFINITIONS };
