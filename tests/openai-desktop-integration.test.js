"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildTurnContext,
  handleOpenAIHookEvent,
  resolveMode
} = require("../runtime/integrations/openai");

function route(level, { skills = [], allowSubagents = false, explicitMultiagent = false } = {}) {
  return {
    profile: level === "MICRO" ? "fast" : "standard",
    allSkills: skills.map((id) => ({ id })),
    complexity: {
      level,
      explicitMultiagent,
      budget: { maxContextTokens: level === "MICRO" ? 1500 : 6000, allowSubagents }
    }
  };
}

test("resolveMode defaults to optimize and rejects unknown modes safely", () => {
  assert.equal(resolveMode(undefined), "optimize");
  assert.equal(resolveMode("observe"), "observe");
  assert.equal(resolveMode("nonsense"), "optimize");
});

test("turn context stays concise and includes only selected skill ids", () => {
  const text = buildTurnContext(route("MICRO", { skills: ["skill-repo-health"] }), "optimize");
  assert.match(text, /complexity=MICRO/);
  assert.match(text, /skill-repo-health/);
  assert.doesNotMatch(text, /full skill body/i);
});

test("observe mode records routing but injects no developer context", () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-openai-"));
  const result = handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s1",
    cwd: process.cwd(),
    prompt: "corrija um typo no README"
  }, { pluginData, mode: "observe", route: () => route("MICRO") });
  assert.deepEqual(result, {});
});

test("optimize mode blocks unnecessary subagent fan-out for MICRO tasks", () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-openai-"));
  handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s2",
    cwd: process.cwd(),
    prompt: "corrija um typo no README"
  }, { pluginData, mode: "optimize", route: () => route("MICRO") });
  const result = handleOpenAIHookEvent({
    hook_event_name: "PreToolUse",
    session_id: "s2",
    cwd: process.cwd(),
    tool_name: "spawn_agent",
    tool_input: {}
  }, { pluginData, mode: "optimize" });
  assert.equal(result.hookSpecificOutput.permissionDecision, "deny");
});

test("explicitly budgeted subagents are not blocked", () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-openai-"));
  handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s3",
    cwd: process.cwd(),
    prompt: "use multiagent para revisar a arquitetura"
  }, { pluginData, mode: "optimize", route: () => route("DEEP", { allowSubagents: true, explicitMultiagent: true }) });
  const result = handleOpenAIHookEvent({
    hook_event_name: "PreToolUse",
    session_id: "s3",
    cwd: process.cwd(),
    tool_name: "Agent"
  }, { pluginData, mode: "optimize" });
  assert.deepEqual(result, {});
});
