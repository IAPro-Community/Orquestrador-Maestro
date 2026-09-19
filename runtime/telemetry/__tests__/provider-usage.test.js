"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseProviderUsage } = require("../provider-usage");
const { extractChildAgents } = require("../agent-topology");
const { buildCognitiveTelemetry } = require("../cognitive-telemetry");

test("codex NDJSON usage is provider-reported with session and model", () => {
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1200, cached_input_tokens: 300, output_tokens: 400 } }),
    JSON.stringify({ type: "thread.completed", usage: { input_tokens: 1200, cached_input_tokens: 300, output_tokens: 400 } })
  ].join("\n");
  const usage = parseProviderUsage({ providerId: "codex", stdout, model: "gpt-test" });
  assert.equal(usage.tool, "codex");
  assert.equal(usage.provider, "unknown");
  assert.equal(usage.model, "gpt-test");
  assert.equal(usage.sessionId, "thread-1");
  assert.equal(usage.tokenInput, 1200);
  assert.equal(usage.tokenOutput, 400);
  assert.equal(usage.cachedInputTokens, 300);
  assert.equal(usage.tokenSource, "provider-reported");
});

test("provider without usage reports unavailable, never zero", () => {
  const usage = parseProviderUsage({ providerId: "codex", stdout: "plain text output", model: "default" });
  assert.equal(usage.tokenInput, null);
  assert.equal(usage.tokenOutput, null);
  assert.equal(usage.tokenSource, "unavailable");
  assert.equal(usage.model, "unknown");
  assert.notEqual(usage.tokenInput, 0);
});

test("malformed and unknown events never throw and are ignored", () => {
  const stdout = "not json\n" + JSON.stringify({ type: "mysterious-future-event", foo: "bar" }) + "\n{broken";
  const usage = parseProviderUsage({ providerId: "claude", stdout });
  assert.equal(usage.tool, "claude");
  assert.equal(usage.tokenSource, "unavailable");
  const agents = extractChildAgents({ providerId: "claude", stdout });
  assert.deepEqual([...agents], []);
});

test("claude stream-json extracts cache split and session", () => {
  const stdout = [
    JSON.stringify({ type: "system", subtype: "init", session_id: "sess-1", model: "claude-test" }),
    JSON.stringify({ type: "assistant", message: { model: "claude-test", content: [{ type: "text", text: "hi" }], usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 50 } } }),
    JSON.stringify({ type: "result", subtype: "success", session_id: "sess-1", usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 50 } })
  ].join("\n");
  const usage = parseProviderUsage({ providerId: "claude", stdout });
  assert.equal(usage.sessionId, "sess-1");
  assert.equal(usage.model, "claude-test");
  assert.equal(usage.tokenInput, 100);
  assert.equal(usage.tokenOutput, 50);
  assert.equal(usage.cachedInputTokens, 50);
  assert.equal(usage.tokenSource, "provider-reported");
});

test("opencode json honors explicit provider and model ids", () => {
  const stdout = [
    JSON.stringify({ type: "step_start", sessionID: "op-1", modelID: "anthropic/claude-test", providerID: "anthropic" }),
    JSON.stringify({ type: "step_finish", sessionID: "op-1", tokens: { input: 200, output: 80, cache: 40 } })
  ].join("\n");
  const usage = parseProviderUsage({ providerId: "opencode", stdout });
  assert.equal(usage.tool, "opencode");
  assert.equal(usage.provider, "anthropic");
  assert.equal(usage.model, "anthropic/claude-test");
  assert.equal(usage.sessionId, "op-1");
  assert.equal(usage.tokenInput, 200);
  assert.equal(usage.cachedInputTokens, 40);
});

test("child agent events are observed without inventing agents", () => {
  const stdout = [
    JSON.stringify({ type: "agent.started", agent_id: "child-1", role: "explore" }),
    JSON.stringify({ type: "message", text: "unrelated" })
  ].join("\n");
  const agents = extractChildAgents({ providerId: "codex", stdout });
  assert.equal(agents.length, 1);
  assert.equal(agents[0].agentId, "child-1");
  assert.equal(agents[0].providerNative, true);
  assert.equal(agents[0].depth, 1);
  const empty = extractChildAgents({ providerId: "codex", stdout: "plain output" });
  assert.equal(empty.length, 0);
});

test("cognitive telemetry separates tool/provider/model and marks unavailable", () => {
  const telemetry = buildCognitiveTelemetry({
    budget: { id: "STANDARD", maxSkills: 3 },
    primaryUsage: { tool: "codex", provider: "unknown", model: "unknown", sessionId: null, tokenInput: null, tokenOutput: null, cachedInputTokens: null, tokenSource: "unavailable", modelCalls: 0 },
    outcome: "completed",
    runId: "run-1",
    taskId: "task-1",
    projectId: "project-1"
  });
  assert.equal(telemetry.tool, "codex");
  assert.equal(telemetry.provider, "unknown");
  assert.equal(telemetry.model, "unknown");
  assert.equal(telemetry.tokenInput, null);
  assert.equal(telemetry.tokenSource, "unavailable");
  assert.ok(telemetry.traceId);
  assert.ok(telemetry.spanId);
  assert.equal(telemetry.childAgentsObserved, 0);
});

test("amplification is null without provider numbers and honest when present", () => {
  const missing = buildCognitiveTelemetry({
    budget: { id: "LEAN", maxSkills: 1 },
    primaryUsage: null,
    outcome: "completed"
  });
  assert.equal(missing.observedInputAmplification, null);
  assert.match(missing.limitation, /Unique useful context/u);
  const present = buildCognitiveTelemetry({
    budget: { id: "STANDARD", maxSkills: 3 },
    primaryUsage: { tool: "codex", provider: "unknown", model: "m", tokenInput: 100, tokenOutput: 10, tokenSource: "provider-reported", usageScope: "unknown", modelCalls: 1 },
    childAgents: [{ agentId: "c1", tokenInput: 100, tokenOutput: 10 }],
    outcome: "completed"
  });
  assert.equal(present.observedInputAmplification, 1);
});

test("aggregate parent totals are never summed with children (no double count)", () => {
  const codexAggregate = parseProviderUsage({
    providerId: "codex",
    stdout: [
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 400, output_tokens: 100 } }),
      JSON.stringify({ type: "thread.completed", usage: { input_tokens: 1000, output_tokens: 300 } })
    ].join("\n")
  });
  assert.equal(codexAggregate.usageScope, "aggregate");
  const telemetry = buildCognitiveTelemetry({
    budget: { id: "STANDARD", maxSkills: 3 },
    primaryUsage: codexAggregate,
    childAgents: [{ agentId: "c1", tokenInput: 400, tokenOutput: 100 }],
    outcome: "completed"
  });
  assert.equal(telemetry.usageScope, "aggregate");
  assert.equal(telemetry.totalInputTokens, null);
  assert.equal(telemetry.observedInputAmplification, null);
  assert.equal(telemetry.tokenInput, 1000);
});

test("unknown scope sums conservatively but stays marked unknown", () => {
  const telemetry = buildCognitiveTelemetry({
    budget: { id: "STANDARD", maxSkills: 3 },
    primaryUsage: { tool: "opencode", provider: "anthropic", model: "m", tokenInput: 200, tokenOutput: 50, tokenSource: "provider-reported", usageScope: "unknown", modelCalls: 1 },
    childAgents: [{ agentId: "c1", tokenInput: 100, tokenOutput: 10 }],
    outcome: "completed"
  });
  assert.equal(telemetry.usageScope, "unknown");
  assert.equal(telemetry.tokenInput, 200);
  assert.equal(telemetry.totalInputTokens, 300);
});

test("session resume does not re-count history as new spend without evidence", () => {
  // Resumed sessions report cumulative totals; without per-execution deltas
  // the conservative scope stays aggregate/unknown, never a fresh sum.
  const resumed = parseProviderUsage({
    providerId: "claude",
    stdout: [
      JSON.stringify({ type: "system", subtype: "init", session_id: "sess-resume" }),
      JSON.stringify({ type: "result", session_id: "sess-resume", usage: { input_tokens: 5000, output_tokens: 200 } })
    ].join("\n")
  });
  assert.equal(resumed.usageScope, "aggregate");
  assert.equal(resumed.sessionId, "sess-resume");
});

test("cache tokens preserve provider semantics without financial claims", () => {
  const claude = parseProviderUsage({
    providerId: "claude",
    stdout: [
      JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 50 } } })
    ].join("\n")
  });
  assert.equal(claude.cachedInputTokens, 50);
  assert.equal(claude.tokenInput, 100);
  // Cached is a subset signal, not additive spend: total stays input-based.
  assert.ok(claude.cachedInputTokens <= claude.tokenInput + 50);
});
