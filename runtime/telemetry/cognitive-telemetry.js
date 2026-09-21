"use strict";

const crypto = require("node:crypto");

/**
 * Enriched cognitive telemetry (evolution of the existing
 * `cognitiveTelemetry` object, not a parallel system).
 *
 * Records, WHEN the provider exposes them:
 * provider/tool/model/session/run/task/execution/project/repo/branch/commit,
 * timing, status, tokenInput/Output, cached tokens, reasoning tokens,
 * modelCalls/toolCalls/retry/review counts, observed child agents, and the
 * metric source.
 *
 * Representation discipline:
 * - tokenSource = "provider-reported" | "derived" | "estimated" | "unavailable"
 * - unavailable numeric fields are null (never 0); unknown strings are
 *   "unknown"; missing ids are null.
 * - No prompt/completion/source content, secrets, .env bytes, credentials,
 *   absolute home paths or PII are stored here: only hashes, IDs, counts,
 *   sizes and sanitized metadata.
 *
 * OpenTelemetry mapping (conceptual, no collector yet):
 * Run -> trace (traceId = run.traceId)
 * Execution -> span (spanId = execution.spanId, parent = traceId)
 * Provider call -> child span; Agent -> span/attributes.
 */

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function traceId() {
  return crypto.randomUUID().replaceAll("-", "");
}

function spanId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return { tokenInput: null, tokenOutput: null, cachedInputTokens: null, cachedOutputTokens: null, reasoningTokens: null, modelCalls: 0, toolCalls: null, tokenSource: "unavailable", usageScope: "unknown", provider: "unknown", model: "unknown", sessionId: null, tool: "unknown" };
  }
  return {
    tokenInput: usage.tokenInput ?? null,
    tokenOutput: usage.tokenOutput ?? null,
    cachedInputTokens: usage.cachedInputTokens ?? null,
    cachedOutputTokens: usage.cachedOutputTokens ?? null,
    reasoningTokens: usage.reasoningTokens ?? null,
    modelCalls: Number.isInteger(usage.modelCalls) ? usage.modelCalls : 0,
    toolCalls: usage.toolCalls ?? null,
    tokenSource: usage.tokenSource || "unavailable",
    usageScope: usage.usageScope || "unknown",
    provider: usage.provider || "unknown",
    model: usage.model || "unknown",
    sessionId: usage.sessionId || null,
    tool: usage.tool || "unknown"
  };
}

/**
 * Derived context-amplification metrics. Honest by construction:
 * - observedInputAmplification = total observed child input / primary input
 *   ONLY when both are provider-reported numbers > 0; else null.
 * - childAmplificationFactor: same ratio scoped to children (alias kept for
 *   future refinement when unique-useful-context becomes measurable).
 * Limitations are documented on the returned object: we do NOT know the
 * unique useful context, so these factors measure observed input volume,
 * not waste.
 */
function amplificationMetrics({ primaryInput, primaryScope, childAgents }) {
  const childInputs = (childAgents || []).map((agent) => agent.tokenInput).filter((value) => Number.isFinite(value) && value > 0);
  const childInputTokens = childInputs.length > 0 ? childInputs.reduce((sum, value) => sum + value, 0) : null;
  // When the primary scope is aggregate, the parent total may already include
  // children: summing would double-count, so total stays null (unknown).
  const totalInputTokens = primaryScope === "aggregate" && childInputTokens !== null ? null
    : primaryInput !== null && childInputTokens !== null ? primaryInput + childInputTokens
      : primaryInput !== null ? primaryInput : childInputTokens;
  let observedInputAmplification = null;
  if (primaryScope !== "aggregate" && Number.isFinite(primaryInput) && primaryInput > 0 && Number.isFinite(childInputTokens) && childInputTokens !== null) {
    observedInputAmplification = childInputTokens / primaryInput;
  }
  return Object.freeze({
    primaryInputTokens: primaryInput ?? null,
    childInputTokens,
    totalInputTokens: totalInputTokens ?? null,
    observedInputAmplification,
    childAmplificationFactor: observedInputAmplification,
    limitation: "Unique useful context is unknown; this ratio measures observed input volume across the run tree, not proven waste. Aggregate parent totals are never summed with children."
  });
}

function buildCognitiveTelemetry({
  budget,
  primaryUsage,
  reviewUsage,
  skillsRequested = 0,
  skillsResolved = 0,
  skillsLoaded = 0,
  outcome = "unknown",
  reason = null,
  runId = null,
  taskId = null,
  executionId = null,
  reviewExecutionId = null,
  projectId = null,
  repositoryId = null,
  branch = null,
  headCommit = null,
  startedAt = null,
  completedAt = null,
  durationMs = null,
  status = null,
  childAgents = [],
  prompt = null,
  contextDigests = null,
  sessionResumed = null,
  automaticRetries = 0,
  escalations = 0,
  providerSwitches = 0,
  reviewCalls: reviewCallsOverride = null,
  traceId: existingTraceId = null,
  spanId: existingSpanId = null
} = {}) {
  const primary = normalizeUsage(primaryUsage);
  const review = reviewUsage ? normalizeUsage(reviewUsage) : null;
  // Primary + review are separate provider calls (different sessions), so
  // summing is safe. Child-agent inputs are NOT summed into the run total
  // when the primary scope is aggregate (parent already includes children).
  const tokenInput = primary.tokenInput !== null || (review && review.tokenInput !== null)
    ? (primary.tokenInput || 0) + ((review && review.tokenInput) || 0) : null;
  const tokenOutput = primary.tokenOutput !== null || (review && review.tokenOutput !== null)
    ? (primary.tokenOutput || 0) + ((review && review.tokenOutput) || 0) : null;
  const cachedInputTokens = primary.cachedInputTokens !== null || (review && review.cachedInputTokens !== null)
    ? (primary.cachedInputTokens || 0) + ((review && review.cachedInputTokens) || 0) : null;
  const tokenSource = primary.tokenSource === "provider-reported" || (review && review.tokenSource === "provider-reported")
    ? "provider-reported" : "unavailable";
  const usageScope = primary.usageScope === "aggregate" || (review && review.usageScope === "aggregate")
    ? "aggregate" : primary.tokenSource === "provider-reported" ? primary.usageScope : "unknown";
  const modelCalls = (primary.modelCalls || 0) + ((review && review.modelCalls) || 0);
  const primaryCalls = primary.modelCalls > 0 ? 1 : (outcome === "blocked" ? 0 : 1);
  // reviewCalls counts real independent-review invocations, never usage
  // availability: a review that ran but exposed no token usage still counts 1.
  const reviewCalls = Number.isInteger(reviewCallsOverride) ? reviewCallsOverride
    : review ? (review.modelCalls > 0 ? 1 : 0) : 0;
  const amplification = amplificationMetrics({ primaryInput: primary.tokenInput, primaryScope: primary.usageScope, childAgents });
  // Context duplication groundwork: hashes only, never content.
  const promptHash = typeof prompt === "string" && prompt.length > 0 ? sha256Hex(prompt).slice(0, 32) : null;
  const agents = Array.isArray(childAgents) ? [...childAgents] : [];
  // childAgentsObserved counts only ID-correlated agents: anonymous
  // observations (no provider identifier) are recorded but never inflate the
  // count — we cannot deduce how many distinct anonymous agents existed.
  const identifiedAgents = agents.filter((agent) => agent && agent.anonymous !== true && agent.agentId !== null && agent.agentId !== undefined);
  const anonymousAgentEvents = agents.filter((agent) => agent && (agent.anonymous === true || agent.agentId === null || agent.agentId === undefined));
  return Object.freeze({
    budgetTier: budget?.id || budget?.tier || "unknown",
    // Identity correlation.
    runId, taskId, executionId, reviewExecutionId, projectId,
    repositoryId, branch: branch || "unknown", headCommit: headCommit || "unknown",
    // Tool/provider/model separation (never conflated).
    tool: primary.tool,
    provider: primary.provider,
    model: primary.model,
    reviewModel: review ? review.model : null,
    sessionId: primary.sessionId,
    reviewSessionId: review ? review.sessionId : null,
    // Timing.
    startedAt, completedAt, durationMs, status: status || outcome,
    // Token economy (null = unavailable, never 0-as-unknown).
    tokenInput, tokenOutput, cachedInputTokens,
    cachedOutputTokens: primary.cachedOutputTokens ?? null,
    reasoningTokens: primary.reasoningTokens ?? null,
    tokenSource,
    usageScope,
    modelCalls,
    primaryCalls,
    reviewCalls,
    toolCalls: primary.toolCalls,
    automaticRetries: Number.isInteger(automaticRetries) && automaticRetries >= 0 ? automaticRetries : null,
    retryScope: "maestro",
    escalations: Number.isInteger(escalations) && escalations >= 0 ? escalations : null,
    providerSwitches: Number.isInteger(providerSwitches) && providerSwitches >= 0 ? providerSwitches : null,
    // Skills economy (existing fields preserved).
    skillsRequested, skillsResolved, skillsLoaded,
    maxSkills: budget?.maxSkills ?? null,
    // Subagent observability: observed count is honest (identified agents
    // only), exposure flag tells whether the provider even exposes topology
    // (0 != "definitely no agents"). Anonymous event volume is reported
    // separately and never merged into the count.
    childAgentsObserved: identifiedAgents.length,
    anonymousAgentEventsObserved: anonymousAgentEvents.length,
    childAgents: Object.freeze(agents),
    topologyExposed: identifiedAgents.length > 0 ? true : (primary.tokenSource === "provider-reported" ? "unknown" : "unknown"),
    // topologyVisibility: "partially-observed" when children were seen (we
    // cannot prove completeness, so never claim full provider-reported);
    // "unavailable" when nothing exposes topology. childAgentsObserved = 0
    // with "unavailable" must NOT be read as "no subagents happened".
    topologyVisibility: identifiedAgents.length > 0 ? "partially-observed" : "unavailable",
    // Amplification + duplication base.
    ...amplification,
    promptBytes: typeof prompt === "string" ? Buffer.byteLength(prompt, "utf8") : null,
    promptHash,
    // Context digests (hashes only): brief manifest, base/worker digests when
    // callers supply them. Enables future duplicate-context detection.
    contextDigests: contextDigests && typeof contextDigests === "object" ? Object.freeze({ ...contextDigests }) : null,
    sessionResumed: sessionResumed === null || sessionResumed === undefined ? null : Boolean(sessionResumed),
    // Tracing (OTel-compatible mapping, local only).
    traceId: existingTraceId || traceId(),
    spanId: existingSpanId || spanId(),
    outcome,
    ...(reason ? { reason } : {})
  });
}

module.exports = { buildCognitiveTelemetry, amplificationMetrics, traceId, spanId };
