"use strict";

const VALID_TRANSITIONS = {
  "CREATED": ["DISCOVERING"],
  "DISCOVERING": ["REFINING"],
  "REFINING": ["WAITING_USER", "READY"],
  "WAITING_USER": ["REFINING"],
  "READY": ["BRIEF_GENERATED"],
  "BRIEF_GENERATED": ["APPROVED", "REFINING"]
};

function isValidTransition(fromState, toState) {
  if (!VALID_TRANSITIONS[fromState]) return false;
  return VALID_TRANSITIONS[fromState].includes(toState);
}

function createIntentSpec(intent, partial = {}) {
  return Object.freeze({
    id: partial.id || `spec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    intent,
    status: partial.status || "CREATED",
    objective: partial.objective || intent,
    requirements: Array.isArray(partial.requirements) ? [...partial.requirements] : [],
    constraints: Array.isArray(partial.constraints) ? [...partial.constraints] : [],
    userDecisions: Array.isArray(partial.userDecisions) ? [...partial.userDecisions] : [],
    unknowns: Array.isArray(partial.unknowns) ? [...partial.unknowns] : [],
    createdAt: partial.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function createIntentUnknown({ id, dimension, description, reason, blocking, status, metadata = {} }) {
  if (typeof blocking !== "boolean") throw new TypeError("blocking must be boolean");
  if (!["OPEN", "RESOLVED", "DISMISSED"].includes(status)) throw new TypeError("status must be OPEN, RESOLVED, or DISMISSED");

  return Object.freeze({
    id,
    dimension,
    description,
    reason,
    blocking,
    status,
    metadata: { ...metadata }
  });
}

module.exports = {
  createIntentSpec,
  createIntentUnknown,
  isValidTransition
};
