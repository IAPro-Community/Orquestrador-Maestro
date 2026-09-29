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

module.exports = { contextResponse, denyTool, preToolContext };
