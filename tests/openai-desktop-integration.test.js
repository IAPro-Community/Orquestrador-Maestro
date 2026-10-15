"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  buildTurnContext,
  desktopPluginDoctor,
  desktopPluginStatus,
  handleOpenAIHookEvent,
  installDesktopPlugin,
  readLedger,
  removeDesktopPlugin,
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


test("personal installer preserves unrelated marketplace entries", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-plugin-home-"));
  const marketplacePath = path.join(home, ".agents", "plugins", "marketplace.json");
  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
  fs.writeFileSync(marketplacePath, JSON.stringify({
    name: "personal",
    plugins: [{
      name: "existing-plugin",
      source: { source: "local", path: "./existing" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Productivity"
    }]
  }), "utf8");

  installDesktopPlugin({ home, packageRoot: path.resolve(__dirname, "..") });
  const installed = desktopPluginStatus({ home, packageRoot: path.resolve(__dirname, "..") });
  assert.equal(installed.installed, true);
  assert.equal(installed.registered, true);

  const afterInstall = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  assert.equal(afterInstall.plugins.some((plugin) => plugin.name === "existing-plugin"), true);
  assert.equal(afterInstall.plugins.some((plugin) => plugin.name === "orquestrador-maestro"), true);

  removeDesktopPlugin({ home, packageRoot: path.resolve(__dirname, "..") });
  const afterRemove = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  assert.equal(afterRemove.plugins.some((plugin) => plugin.name === "existing-plugin"), true);
  assert.equal(afterRemove.plugins.some((plugin) => plugin.name === "orquestrador-maestro"), false);
});


test("repeated desktop policy is not injected twice", () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-openai-ledger-"));
  const routed = () => route("SIMPLE", { skills: ["skill-repo-health"] });
  const first = handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s-repeat",
    turn_id: "t1",
    cwd: process.cwd(),
    prompt: "ajuste uma função pequena"
  }, { pluginData, mode: "optimize", route: routed });
  const second = handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s-repeat",
    turn_id: "t2",
    cwd: process.cwd(),
    prompt: "ajuste outra função pequena"
  }, { pluginData, mode: "optimize", route: routed });

  assert.ok(first.hookSpecificOutput?.additionalContext);
  assert.deepEqual(second, {});
  const ledger = readLedger(pluginData, "s-repeat");
  assert.equal(ledger.counters.policyInjections, 1);
  assert.equal(ledger.counters.policySkips, 1);
});

test("compaction rehydrates only the Maestro context capsule", () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-openai-compact-"));
  handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s-compact",
    turn_id: "t1",
    cwd: process.cwd(),
    prompt: "corrija um typo no README"
  }, { pluginData, mode: "optimize", route: () => route("MICRO", { skills: ["skill-repo-health"] }) });

  handleOpenAIHookEvent({
    hook_event_name: "PreCompact",
    session_id: "s-compact",
    cwd: process.cwd()
  }, { pluginData, mode: "optimize" });

  const resumed = handleOpenAIHookEvent({
    hook_event_name: "SessionStart",
    source: "compact",
    session_id: "s-compact",
    cwd: process.cwd()
  }, { pluginData, mode: "optimize" });

  assert.match(resumed.hookSpecificOutput.additionalContext, /Maestro context capsule/);
  assert.match(resumed.hookSpecificOutput.additionalContext, /skill-repo-health/);
});

test("desktop doctor validates the installed governor package", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-plugin-doctor-"));
  const packageRoot = path.resolve(__dirname, "..");
  installDesktopPlugin({ home, packageRoot });
  const result = desktopPluginDoctor({ home, packageRoot });
  assert.equal(result.healthy, true, JSON.stringify(result.failed));
  assert.equal(result.checks.find((check) => check.id === "synthetic-hook")?.pass, true);
  assert.equal(result.checks.find((check) => check.id === "mcp-tools")?.pass, true);
});


test("policy digest changes when the effective context budget changes", () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-openai-budget-"));
  const makeRoute = (maxContextTokens) => ({
    profile: "standard",
    allSkills: [{ id: "skill-repo-health" }],
    complexity: {
      level: "STANDARD",
      explicitMultiagent: false,
      budget: { maxContextTokens, allowSubagents: false }
    }
  });

  const first = handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s-budget",
    turn_id: "t1",
    cwd: process.cwd(),
    prompt: "revise este módulo"
  }, { pluginData, mode: "optimize", route: () => makeRoute(6000) });

  const second = handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s-budget",
    turn_id: "t2",
    cwd: process.cwd(),
    prompt: "revise este módulo novamente"
  }, { pluginData, mode: "optimize", route: () => makeRoute(4000) });

  assert.ok(first.hookSpecificOutput?.additionalContext);
  assert.ok(second.hookSpecificOutput?.additionalContext);
  const ledger = readLedger(pluginData, "s-budget");
  assert.equal(ledger.policy.contextBudget, 4000);
  assert.equal(ledger.counters.policyInjections, 2);
});


test("PreToolUse returns updatedInput for safe read-only Bash scans", () => {
  const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-openai-rewrite-"));
  handleOpenAIHookEvent({
    hook_event_name: "UserPromptSubmit",
    session_id: "s-rewrite",
    turn_id: "t1",
    cwd: process.cwd(),
    prompt: "corrija um typo no README"
  }, { pluginData, mode: "optimize", route: () => route("MICRO") });

  const result = handleOpenAIHookEvent({
    hook_event_name: "PreToolUse",
    session_id: "s-rewrite",
    cwd: process.cwd(),
    tool_name: "Bash",
    tool_input: { command: "rg TODO ." }
  }, { pluginData, mode: "optimize" });

  assert.equal(result.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(result.hookSpecificOutput.updatedInput.command, "rg TODO . | head -n 80");
  const ledger = readLedger(pluginData, "s-rewrite");
  assert.equal(ledger.counters.toolRewrites, 1);
});


test("desktop doctor detects a stale installed plugin version", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-plugin-stale-"));
  const packageRoot = path.resolve(__dirname, "..");
  installDesktopPlugin({ home, packageRoot });
  const before = desktopPluginStatus({ home, packageRoot });
  assert.equal(before.versionMatch, true);

  const manifestPath = path.join(home, ".codex", "plugins", "orquestrador-maestro", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = "0.0.0-stale";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const result = desktopPluginDoctor({ home, packageRoot });
  assert.equal(result.healthy, false);
  assert.ok(result.failed.includes("version:plugin.json"));
});
