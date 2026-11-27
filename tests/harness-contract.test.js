"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { observeHarnessEvent, evaluateContinuationAuthority, hookResponse, createOpenCodeHooks } = require("../runtime/integrations/harness/contract");
const { PRIORITIZED_HARNESSES, inspectHarness, inspectAllHarnesses } = require("../runtime/integrations/harness/registry");
const { renderHookConfig, editHookConfig } = require("../scripts/harness-hook");
const script = path.join(__dirname, "..", "scripts", "harness-hook.js");

for (const [host, promptEvent, endEvent] of [["codex", "UserPromptSubmit", "Stop"], ["claude", "UserPromptSubmit", "Stop"], ["gemini", "BeforeAgent", "AfterAgent"]]) {
  test(`${host}: goal observation is not execution or acceptance`, () => {
    const input = { hook_event_name: promptEvent, prompt: "/goal implement feature", goalState: "completed", dispatchAllowed: true };
    const observed = observeHarnessEvent(host, input);
    assert.equal(observed.commandObserved, true);
    assert.equal(observed.continuationOwner, "external-host");
    assert.equal(observed.goalState, "unknown");
    assert.equal(observed.verification, "not-performed");
    assert.equal(observed.dispatchAllowed, false);
    assert.match(hookResponse(host, input).hookSpecificOutput.additionalContext, /do not launch a competing loop/);
    assert.deepEqual(hookResponse(host, { ...input, prompt: "ordinary request" }), {});
    assert.deepEqual(hookResponse(host, { ...input, hook_event_name: endEvent }), {});
    assert.equal(observeHarnessEvent(host, { hook_event_name: endEvent }).kind, "turn-end");
  });
}

test("unknown hosts/events never become capabilities", () => {
  for (const host of ["__proto__", "constructor", "cursor"]) assert.equal(observeHarnessEvent(host, { hook_event_name: "Stop" }), null);
  assert.equal(observeHarnessEvent("claude", { hook_event_name: "toString" }), null);
  assert.equal(observeHarnessEvent("gemini", { hook_event_name: "Stop" }), null);
  assert.equal(observeHarnessEvent("claude", null), null);
});

test("OpenCode V2 prompt stays intact and guidance is bounded per request/session", () => {
  const hooks = createOpenCodeHooks();
  const event = { sessionID: "one", prompt: { text: "/goal feature", files: [{ uri: "file:///project/a" }] } };
  const original = JSON.stringify(event);
  hooks.prompt(event);
  assert.equal(JSON.stringify(event), original);
  const ctx = { sessionID: "one", system: [] };
  hooks.context(ctx); hooks.context(ctx);
  assert.equal(ctx.system.length, 1);
  assert.match(ctx.system[0].text, /state unverified/);
  const other = { sessionID: "two", system: [] };
  hooks.context(other); assert.deepEqual(other.system, []);
  hooks.prompt({ sessionID: "one", prompt: { text: "ordinary request" } });
  const next = { sessionID: "one", system: [] };
  hooks.context(next); assert.deepEqual(next.system, []);
  for (let i = 0; i < 257; i++) hooks.prompt({ sessionID: String(i), prompt: { text: "/goal x" } });
  const evicted = { sessionID: "0", system: [] };
  hooks.context(evicted); assert.deepEqual(evicted.system, []);
  hooks.dispose();
  const disposed = { sessionID: "256", system: [] };
  hooks.context(disposed); assert.deepEqual(disposed.system, []);
});

test("renderer is opt-in and rejects unsafe command paths", () => {
  const claude = renderHookConfig("claude", path.resolve("folder with spaces", "hook.js"));
  const gemini = renderHookConfig("gemini", path.resolve("folder", "hook.js"));
  assert.deepEqual(Object.keys(claude.hooks), ["UserPromptSubmit", "Stop"]);
  assert.deepEqual(Object.keys(gemini.hooks), ["BeforeAgent", "AfterAgent"]);
  assert.equal(claude.hooks.Stop[0].hooks[0].timeout, 5);
  assert.equal(gemini.hooks.AfterAgent[0].hooks[0].timeout, 5000);
  assert.throws(() => renderHookConfig("claude", "bad$(command).js"));
  assert.throws(() => renderHookConfig("unknown"));
});

test("real hook process emits valid neutral JSON on malformed or end payload", () => {
  for (const [host, input] of [["claude", "not JSON"], ["gemini", JSON.stringify({ hook_event_name: "AfterAgent", prompt: "/goal x" })]]) {
    const result = spawnSync(process.execPath, [script, host], { input, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {});
  }
  const result = spawnSync(process.execPath, [script, "claude"], { input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "/goal x" }), encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /state unverified/);
});

test("merge and remove preserve existing host settings and are idempotent", () => {
  const config = { model: "user-choice", hooks: { UserPromptSubmit: [{ hooks: [{ command: "user-hook" }] }], Stop: [], Other: [{ hooks: [{ command: "other" }] }] } };
  const original = JSON.stringify(config);
  const merged = editHookConfig("claude", config);
  assert.equal(JSON.stringify(config), original);
  assert.deepEqual(merged.hooks.UserPromptSubmit[0], config.hooks.UserPromptSubmit[0]);
  assert.deepEqual(merged.hooks.Other, config.hooks.Other);
  assert.equal(merged.model, "user-choice");
  assert.deepEqual(editHookConfig("claude", merged), merged);
  const removed = editHookConfig("claude", merged, { remove: true });
  assert.deepEqual(removed.hooks.UserPromptSubmit, config.hooks.UserPromptSubmit);
  assert.deepEqual(removed.hooks.Other, config.hooks.Other);
  assert.equal(removed.hooks.Stop, undefined);
  assert.deepEqual(editHookConfig("claude", removed, { remove: true }), removed);
  assert.throws(() => editHookConfig("claude", { hooks: { Stop: "broken" } }));
  assert.throws(() => editHookConfig("claude", null));
  assert.throws(() => editHookConfig("claude", { hooks: [] }));
});

test("config CLI rejects malformed settings rather than replacing them", () => {
  const invalid = spawnSync(process.execPath, [script, "--merge", "gemini"], { input: "not JSON", encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  const valid = spawnSync(process.execPath, [script, "--merge", "gemini"], { input: JSON.stringify({ theme: "user" }), encoding: "utf8" });
  assert.equal(valid.status, 0);
  assert.equal(JSON.parse(valid.stdout).theme, "user");
});

test("enriched contract tracks surfaces, sessions, idle boundaries, and single continuation authority", () => {
  const start = observeHarnessEvent("codex", { hook_event_name: "SessionStart", session_id: "s-1", turn_id: "t-1" }, { surface: "desktop", hostVersion: "0.172.0" });
  assert.equal(start.kind, "session-start");
  assert.equal(start.surface, "desktop");
  assert.equal(start.hostVersion, "0.172.0");
  assert.equal(start.sessionId, "s-1");
  assert.equal(start.goalState, "unknown");
  assert.equal(start.dispatchAllowed, false);

  const ocHooks = createOpenCodeHooks();
  ocHooks.prompt({ sessionID: "oc-1", messageID: "m-1", prompt: { text: "/goal validate" } });
  ocHooks.idle({ sessionID: "oc-1", background: [] });
  assert.equal(ocHooks.getObservedState("oc-1").goalState, "unknown");
  assert.ok(ocHooks.getObservedState("oc-1").lastIdleAt);

  const activeNative = evaluateContinuationAuthority({ host: "codex", surface: "tui", installed: true, version: "0.172.0", nativeGoalActive: true, requestedOwner: "maestro-managed", managedAuthorized: true, managedCertified: true });
  assert.equal(activeNative.owner, "native-provider");
  assert.equal(activeNative.competingLoopBlocked, true);
  assert.equal(activeNative.dispatchAllowed, false);

  const uncertifiedManaged = evaluateContinuationAuthority({ host: "claude", surface: "cli", installed: true, version: "2.1.0", requestedOwner: "maestro-managed", managedAuthorized: true, managedCertified: false });
  assert.equal(uncertifiedManaged.owner, null);
  assert.equal(uncertifiedManaged.reason, "MANAGED_GOAL_LOOP_NOT_CERTIFIED");
});

test("harness registry covers all prioritized harnesses and classifies levels honestly", t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-harness-reg-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const matrix = inspectAllHarnesses({
    home,
    probeCommand: (cmd) => ({ installed: cmd === "claude" || cmd === "codex", version: cmd === "claude" ? "2.1.325" : "0.172.0" })
  });
  for (const id of PRIORITIZED_HARNESSES) {
    assert.ok(matrix.harnesses[id], `missing prioritized harness ${id}`);
  }
  // Installing binary alone does not claim governed or goal-integrated.
  assert.equal(matrix.harnesses.claude.installed, true);
  assert.equal(matrix.harnesses.claude.compatibilityLevel, "portable");
  assert.equal(matrix.summary.goalIntegrated, 0);

  // Configuring valid Claude hooks upgrades active compatibilityLevel to governed, still never goal-integrated.
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  const merged = editHookConfig("claude", { model: "sonnet" }, { script: path.resolve(__dirname, "..", "scripts", "harness-hook.js") });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify(merged));
  const claude = inspectHarness("claude", { home, probeCommand: () => ({ installed: true, version: "2.1.325" }) });
  assert.equal(claude.compatibilityLevel, "governed");
  assert.equal(claude.continuationAuthority, "external-host");
  assert.ok(claude.unavailabilityReasons.includes("NATIVE_GOAL_LIFECYCLE_NOT_CERTIFIED"));
});


test("native prompt routing is advisory and fail-open for Claude and Gemini", () => {
  const { classifyComplexity } = require("../runtime/planner/complexity-gate");
  const route = () => ({ routingVersion: 3, profile: "standard", complexity: classifyComplexity("frontend-design"), allSkills: [{ id: "skill-open-design-ui", path: "/skills/ui" }] });
  for (const [host, event] of [["claude", "UserPromptSubmit"], ["gemini", "BeforeAgent"]]) {
    const input = { hook_event_name: event, prompt: "frontend-design", cwd: process.cwd() };
    const output = hookResponse(host, input, { routeNative: true, route });
    assert.match(output.hookSpecificOutput.additionalContext, /skill-open-design-ui/u);
    assert.equal("decision" in output, false);
    assert.equal("continue" in output, false);
    assert.deepEqual(hookResponse(host, input, { routeNative: true, route: () => { throw Error("unavailable"); } }), {});
    assert.deepEqual(hookResponse(host, { ...input, cwd: null }, { routeNative: true, route }), {});
    assert.match(hookResponse(host, { ...input, prompt: "/goal do it" }, { routeNative: true, route }).hookSpecificOutput.additionalContext, /competing loop/u);
  }
});
