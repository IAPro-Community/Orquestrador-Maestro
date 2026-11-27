"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  governToolUse,
  hasOutputBound,
  isBroadRepositoryScan,
  rewriteBroadBashInput
} = require("../runtime/integrations/openai");

test("MICRO advises narrowing repository-wide Bash scans without rewriting them", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "rg TODO ." },
    complexity: "MICRO",
    allowSubagents: false,
    mode: "optimize"
  });
  assert.equal(decision.action, "context");
  assert.equal(decision.updatedInput, undefined);
  assert.equal(isBroadRepositoryScan("Bash", { command: "rg TODO ." }), true);
});

test("SIMPLE advises narrowing PowerShell recursive scans without changing semantics", () => {
  const decision = governToolUse({
    toolName: "Bash",
    toolInput: { command: "Get-ChildItem . -Recurse" },
    complexity: "SIMPLE",
    mode: "optimize"
  });
  assert.equal(decision.action, "context");
  assert.equal(decision.updatedInput, undefined);
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


test("shell scan guidance cannot rewrite compound, destructive, or redirection commands", () => {
  for (const command of ["rg TODO . && npm test", "find . -type f -delete", "rg TODO . > report.txt", "rg TODO .", "Get-ChildItem . -Recurse"]) {
    const input = { command };
    assert.equal(rewriteBroadBashInput(input), null);
    const decision = governToolUse({ toolName: "Bash", toolInput: input, complexity: "MICRO" });
    assert.notEqual(decision.action, "rewrite");
    assert.equal(decision.updatedInput, undefined);
    assert.equal(input.command, command);
  }
  assert.equal(governToolUse({ toolName: "Bash", toolInput: { command: "rg TODO . | head -n 40" }, complexity: "MICRO" }).action, "allow");
});
