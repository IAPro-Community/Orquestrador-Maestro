"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  governToolUse,
  hasOutputBound,
  isBroadRepositoryScan,
  rewriteBroadBashInput
} = require("../runtime/integrations/openai");

test("MICRO rewrites read-only repository-wide Bash scans with bounded output", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "rg TODO ." },
    complexity: "MICRO",
    allowSubagents: false,
    mode: "optimize"
  });
  assert.equal(decision.action, "rewrite");
  assert.equal(decision.updatedInput.command, "rg TODO . | head -n 80");
  assert.equal(isBroadRepositoryScan("Bash", { command: "rg TODO ." }), true);
});

test("SIMPLE bounds PowerShell recursive scans without changing their read-only semantics", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "Get-ChildItem . -Recurse" },
    complexity: "SIMPLE",
    mode: "optimize"
  });
  assert.equal(decision.action, "rewrite");
  assert.match(decision.updatedInput.command, /Select-Object -First 120$/);
});

test("bounded commands are not rewritten twice", () => {
  const input = { command: "rg TODO . | head -n 40" };
  assert.equal(hasOutputBound(input.command), true);
  assert.equal(rewriteBroadBashInput(input, "MICRO"), null);
});

test("structured broad scans remain denied for small tasks so the model must choose scope", () => {
  const decision = governToolUse({
    toolName: "Glob",
    toolInput: { path: ".", pattern: "**/*" },
    complexity: "SIMPLE",
    mode: "optimize"
  });
  assert.equal(decision.action, "deny");
});

test("strict mode denies broad scans instead of rewriting them", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "rg TODO ." },
    complexity: "MICRO",
    mode: "strict"
  });
  assert.equal(decision.action, "deny");
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
