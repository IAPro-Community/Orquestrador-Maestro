"use strict";

const ESCALATION_REASONS = Object.freeze([
  "insufficient-context",
  "provider-failure",
  "validation-failure",
  "tool-failure",
  "policy-block",
  "human-required"
]);

function contextRelatedBlocker(code) {
  const value = String(code || "").toUpperCase();
  return value.includes("CONTEXT") || value.includes("MISSING_FACT") || value.includes("MISSING_REQUIREMENT");
}

function classifyResolutionFailure(error = {}) {
  const code = String(error.code || error.reason || "").toUpperCase();
  const failureKind = String(error.failureKind || "").toLowerCase();
  const blockerCodes = Array.isArray(error.blockerCodes) ? error.blockerCodes : [];

  if (code.includes("HUMAN") || code.includes("APPROVAL") || code.includes("ATTENTION")) return "human-required";
  if (code.includes("POLICY") || code.includes("GOVERNANCE") || code.includes("SCOPE")) return "policy-block";
  if (code.includes("PROVIDER") || failureKind === "provider" || failureKind === "transport") return "provider-failure";
  if (code.includes("TOOL") || failureKind === "tool") return "tool-failure";
  if (failureKind === "validation") {
    return blockerCodes.some(contextRelatedBlocker) ? "insufficient-context" : "validation-failure";
  }
  if (code === "STRUCTURED_OUTPUT_FAILED" && blockerCodes.some(contextRelatedBlocker)) return "insufficient-context";
  return "validation-failure";
}

function shouldEscalateContext(reason) {
  return reason === "insufficient-context";
}

function shouldSwitchProvider(reason) {
  return reason === "provider-failure";
}

module.exports = {
  ESCALATION_REASONS,
  contextRelatedBlocker,
  classifyResolutionFailure,
  shouldEscalateContext,
  shouldSwitchProvider
};
