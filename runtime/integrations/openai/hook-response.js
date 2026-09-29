"use strict";

function contextResponse(eventName, additionalContext, extra = {}) {
  return {
    ...extra,
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext
    }
  };
}

function denyTool(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason
    }
  };
}

function preToolContext(additionalContext) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext
    }
  };
}

function rewriteTool(updatedInput) {
  if (!updatedInput || typeof updatedInput !== "object" || Array.isArray(updatedInput)) {
    throw new TypeError("updatedInput must be an object");
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput
    }
  };
}

module.exports = { contextResponse, denyTool, preToolContext, rewriteTool };
