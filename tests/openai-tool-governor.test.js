"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { governToolUse, isBroadRepositoryScan } = require("../runtime/integrations/openai");

test("MICRO denies repository-wide Bash scans", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "rg TODO ." },
    complexity: "MICRO",
    allowSubagents: false,
    mode: "optimize"
  });
  assert.equal(decision.action, "deny");
  assert.equal(isBroadRepositoryScan("Bash", { command: "rg TODO ." }), true);
});

test("STANDARD warns before expanding repository scope", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "find . -type f" },
    complexity: "STANDARD",
    mode: "optimize"
  });
  assert.equal(decision.action, "context");
});

test("COMPLEX allows broad scans when the budget justifies them", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "rg TODO ." },
    complexity: "COMPLEX",
    mode: "optimize"
  });
  assert.equal(decision.action, "allow");
});

test("subagents remain denied unless explicitly budgeted", () => {
  assert.equal(governToolUse({
    toolName: "spawn_agent",
    complexity: "SIMPLE",
    allowSubagents: false,
    mode: "optimize"
  }).action, "deny");

  assert.equal(governToolUse({
    toolName: "spawn_agent",
    complexity: "DEEP",
    allowSubagents: true,
    mode: "optimize"
  }).action, "allow");
});
