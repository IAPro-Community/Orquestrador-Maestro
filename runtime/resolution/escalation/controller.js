"use strict";

const { shouldEscalateContext } = require("./classifier");

const STRATEGIES = Object.freeze(["targeted", "balanced", "deep"]);

function nextResolutionStrategy(current) {
  const index = STRATEGIES.indexOf(current);
  if (index < 0 || index >= STRATEGIES.length - 1) return null;
  return STRATEGIES[index + 1];
}

function recordEscalation(contract, { reason, from, to, at = new Date().toISOString() } = {}) {
  if (!contract || contract.engine !== "maestro-resolution-engine") throw new TypeError("canonical resolution contract is required");
  if (!shouldEscalateContext(reason)) throw new TypeError(`reason does not permit context escalation: ${reason}`);
  if (contract.escalation.count >= contract.escalation.max) {
    const error = new Error("RESOLUTION_ESCALATION_LIMIT: maximum escalations reached");
    error.code = "RESOLUTION_ESCALATION_LIMIT";
    throw error;
  }
  if (!STRATEGIES.includes(from) || !STRATEGIES.includes(to) || STRATEGIES.indexOf(to) <= STRATEGIES.indexOf(from)) {
    throw new TypeError("resolution escalation must move to a deeper strategy");
  }
  return Object.freeze({
    ...contract,
    strategy: to,
    escalation: Object.freeze({
      ...contract.escalation,
      count: contract.escalation.count + 1,
      history: Object.freeze([
        ...(contract.escalation.history || []),
        Object.freeze({ reason, from, to, at })
      ])
    })
  });
}

module.exports = { STRATEGIES, nextResolutionStrategy, recordEscalation };
