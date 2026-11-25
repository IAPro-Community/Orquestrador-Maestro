"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { observeHarnessEvent, hookResponse, createOpenCodeHooks } = require("../runtime/integrations/harness/contract");
const { renderHookConfig } = require("../scripts/harness-hook");
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
