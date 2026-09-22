"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planProgressively, summarizePlanningPair } = require("../progressive-planning");

class MockContextEngine {
  constructor(config = {}) {
    this.workspacePath = "/workspace";
    this.config = config;
    this.last = null;
    this.calls = [];
  }
  async buildContext(intent, maxTokens, options) {
    const strategy = options.adaptiveResolutionExperiment.strategy;
    this.calls.push(strategy);
    const configured = this.config[strategy] || {};
    const effective = configured.effectiveBriefMaxChars || (strategy === "targeted" ? 4000 : strategy === "balanced" ? 8000 : 12000);
    this.last = {
      contextDigest: configured.contextDigest || `digest-${effective}`,
      estimatedTokens: configured.estimatedTokens || Math.ceil(effective / 4),
      briefMaxChars: effective,
      experiment: { applied: effective !== 8000, strategy }
    };
    return { intent, items: [{ key: "context.brief", value: { content: strategy }, kind: "FACT" }] };
  }
  getLastBuildMetrics() { return this.last; }
}

class MockPlanner {
  constructor(outcomes = {}) {
    this.outcomes = outcomes;
    this.calls = [];
    this.fallbackCalls = 0;
  }
  async plan(options) {
    const strategy = options.taskRelevantContext.items[0].value.content;
    this.calls.push({ strategy, maxAttempts: options.maxAttempts });
    const outcome = this.outcomes[strategy] || "success";
    const telemetry = { modelCalls: 1, estimatedPromptTokens: strategy === "targeted" ? 100 : strategy === "balanced" ? 200 : 300, providerTokens: null, durationMs: 10, tokenCompleteness: "unavailable" };
    if (outcome === "success") return { planningMode: "local-ai", taskGraph: { tasks: [{}] }, proposal: { tasks: [{}] }, planningTelemetry: telemetry };
    const error = new Error(outcome);
    error.code = outcome === "provider" ? "PROVIDER_EXECUTION_FAILED" : "STRUCTURED_OUTPUT_FAILED";
    error.failureKind = outcome;
    error.blockerCodes = outcome === "validation" ? ["CONTEXT_FACT_CONTRADICTION"] : [];
    error.planningTelemetry = telemetry;
    throw error;
  }
  buildFallback({ planningTelemetry }) {
    this.fallbackCalls += 1;
    return { planningMode: "deterministic-fallback", taskGraph: { tasks: [{}] }, proposal: { tasks: [{}] }, planningTelemetry: { ...planningTelemetry, fallbackUsed: true } };
  }
}

test("progressive planning stops on targeted success with one model call", async () => {
  const contextEngine = new MockContextEngine();
  const planner = new MockPlanner({ targeted: "success" });
  const result = await planProgressively({
    contextEngine, planner, intent: "task", missionBrief: { id: "m1", objective: "task" },
    experiment: { authorized: true, pairId: "pair-1", startStrategy: "targeted" }
  });
  assert.equal(result.planningMode, "local-ai");
  assert.equal(result.progressivePlanning.successStrategy, "targeted");
  assert.equal(result.progressivePlanning.planningTelemetry.modelCalls, 1);
  assert.deepEqual(planner.calls.map((call) => call.maxAttempts), [1]);
});

test("validation failure escalates context, but duplicate baseline context is skipped", async () => {
  const contextEngine = new MockContextEngine({
    targeted: { effectiveBriefMaxChars: 8000, contextDigest: "baseline" },
    balanced: { effectiveBriefMaxChars: 8000, contextDigest: "baseline" },
    deep: { effectiveBriefMaxChars: 12000, contextDigest: "deep" }
  });
  const planner = new MockPlanner({ targeted: "validation", deep: "success" });
  const result = await planProgressively({
    contextEngine, planner, intent: "task", missionBrief: { id: "m2", objective: "task" },
    experiment: { authorized: true, pairId: "pair-2", startStrategy: "targeted" }
  });
  assert.deepEqual(contextEngine.calls, ["targeted", "balanced", "deep"]);
  assert.deepEqual(planner.calls.map((call) => call.strategy), ["targeted", "deep"]);
  assert.equal(result.progressivePlanning.duplicateContextsSkipped, 1);
  assert.equal(result.progressivePlanning.contextEscalations, 1);
  assert.equal(result.progressivePlanning.successStrategy, "deep");
});

test("parse failure does not buy more context and falls back deterministically", async () => {
  const contextEngine = new MockContextEngine();
  const planner = new MockPlanner({ targeted: "parse" });
  const result = await planProgressively({
    contextEngine, planner, intent: "task", missionBrief: { id: "m3", objective: "task" },
    experiment: { authorized: true, pairId: "pair-3", startStrategy: "targeted" }
  });
  assert.equal(planner.calls.length, 1);
  assert.equal(contextEngine.calls.length, 1);
  assert.equal(planner.fallbackCalls, 1);
  assert.equal(result.planningMode, "deterministic-fallback");
  assert.equal(result.progressivePlanning.terminalReason, "validation-failure");
});

test("provider failure never escalates context", async () => {
  const contextEngine = new MockContextEngine();
  const planner = new MockPlanner({ targeted: "provider" });
  const result = await planProgressively({
    contextEngine, planner, intent: "task", missionBrief: { id: "m4", objective: "task" },
    experiment: { authorized: true, pairId: "pair-4", startStrategy: "targeted" }
  });
  assert.equal(contextEngine.calls.length, 1);
  assert.equal(planner.calls.length, 1);
  assert.equal(result.progressivePlanning.terminalReason, "provider-failure");
});

test("planning pair summary keeps token/call savings descriptive", () => {
  const summary = summarizePlanningPair({
    control: { planningMode: "local-ai", planningTelemetry: { modelCalls: 3, providerTokens: 3000, estimatedPromptTokens: 2400 } },
    treatment: { planningMode: "local-ai", planningTelemetry: { modelCalls: 1, providerTokens: 900, estimatedPromptTokens: 600 }, progressivePlanning: { fallbackUsed: false, successStrategy: "targeted" } }
  });
  assert.equal(summary.modelCallSavings, 2);
  assert.equal(summary.providerTokenSavings, 2100);
  assert.equal(summary.estimatedPromptTokenSavings, 1800);
  assert.equal(summary.treatmentSuccessStrategy, "targeted");
});
