"use strict";

/**
 * PR18 ETAPA 6/7/8 telemetry honesty gates.
 *
 * - response.completed never counts as an independent model call.
 * - turn + response.completed + thread.completed of one generation = 1 call.
 * - per-turn readings are last-wins (scope unknown); thread summary replaces
 *   as the aggregate total (no numeric cumulative guessing).
 * - childAgentsObserved counts ID-correlated agents only; anonymous events go
 *   to anonymousAgentEventsObserved and never inflate the count.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseProviderUsage } = require("../provider-usage");
const { extractChildAgents } = require("../agent-topology");
const { buildCognitiveTelemetry } = require("../cognitive-telemetry");

const line = (obj) => JSON.stringify(obj);

test("response.completed never counts as an independent model call", () => {
  const usage = parseProviderUsage({
    providerId: "codex",
    stdout: [
      line({ type: "turn.completed", usage: { input_tokens: 400, output_tokens: 100 } }),
      line({ type: "response.completed", usage: { input_tokens: 400, output_tokens: 100 } }),
      line({ type: "thread.completed", usage: { input_tokens: 400, output_tokens: 100 } })
    ].join("\n")
  });
  assert.equal(usage.modelCalls, 1);
  assert.equal(usage.tokenInput, 400);
  assert.equal(usage.usageScope, "aggregate");
});

test("response.completed alone implies no counted generation", () => {
  const usage = parseProviderUsage({
    providerId: "codex",
    stdout: line({ type: "response.completed", usage: { input_tokens: 50, output_tokens: 10 } })
  });
  assert.equal(usage.modelCalls, 0);
  assert.equal(usage.tokenInput, 50);
});

test("multi-turn readings are last-wins with unknown scope", () => {
  const usage = parseProviderUsage({
    providerId: "codex",
    stdout: [
      line({ type: "turn.completed", usage: { input_tokens: 400, output_tokens: 100 } }),
      line({ type: "turn.completed", usage: { input_tokens: 600, output_tokens: 150 } })
    ].join("\n")
  });
  assert.equal(usage.modelCalls, 2);
  assert.equal(usage.tokenInput, 600);
  assert.equal(usage.tokenOutput, 150);
  assert.equal(usage.usageScope, "unknown");
});

test("thread summary replaces turn readings as the aggregate total", () => {
  const usage = parseProviderUsage({
    providerId: "codex",
    stdout: [
      line({ type: "turn.completed", usage: { input_tokens: 400, output_tokens: 100 } }),
      line({ type: "thread.completed", usage: { input_tokens: 1000, output_tokens: 300 } })
    ].join("\n")
  });
  assert.equal(usage.tokenInput, 1000);
  assert.equal(usage.tokenOutput, 300);
  assert.equal(usage.usageScope, "aggregate");
});

test("anonymous agent events never inflate childAgentsObserved", () => {
  const stdout = [
    line({ type: "agent.started", startedAt: "t0" }),
    line({ type: "agent.completed", completedAt: "t1" }),
    line({ type: "agent.completed", agent_id: "real-1", usage: { input_tokens: 10, output_tokens: 5 } })
  ].join("\n");
  const agents = [...extractChildAgents({ providerId: "codex", stdout })];
  assert.equal(agents.length, 3);
  const telemetry = buildCognitiveTelemetry({
    budget: { id: "STANDARD", maxSkills: 3 },
    primaryUsage: { tool: "codex", provider: "unknown", model: "m", tokenInput: 100, tokenOutput: 10, tokenSource: "provider-reported", usageScope: "unknown", modelCalls: 1 },
    childAgents: agents,
    outcome: "completed"
  });
  assert.equal(telemetry.childAgentsObserved, 1);
  assert.equal(telemetry.anonymousAgentEventsObserved, 2);
  assert.equal(telemetry.topologyVisibility, "partially-observed");
});

test("all-anonymous observations stay counted as zero identified", () => {
  const stdout = [
    line({ type: "agent.started" }),
    line({ type: "agent.completed" })
  ].join("\n");
  const agents = [...extractChildAgents({ providerId: "codex", stdout })];
  const telemetry = buildCognitiveTelemetry({
    budget: { id: "STANDARD", maxSkills: 3 },
    primaryUsage: null,
    childAgents: agents,
    outcome: "completed"
  });
  assert.equal(telemetry.childAgentsObserved, 0);
  assert.equal(telemetry.anonymousAgentEventsObserved, 2);
  assert.equal(telemetry.topologyVisibility, "unavailable");
});
