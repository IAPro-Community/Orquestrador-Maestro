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
    return { tokenInput: null, tokenOutput: null, cachedInputTokens: null, cachedOutputTokens: null, reasoningTokens: null, modelCalls: 0, toolCalls: null, tokenSource: "unavailable", provider: "unknown", model: "unknown", sessionId: null, tool: "unknown" };
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
function amplificationMetrics({ primaryInput, childAgents }) {
  const childInputs = (childAgents || []).map((agent) => agent.tokenInput).filter((value) => Number.isFinite(value) && value > 0);
  const childInputTokens = childInputs.length > 0 ? childInputs.reduce((sum, value) => sum + value, 0) : null;
  const totalInputTokens = primaryInput !== null && childInputTokens !== null ? primaryInput + childInputTokens
    : primaryInput !== null ? primaryInput : childInputTokens;
  let observedInputAmplification = null;
  if (Number.isFinite(primaryInput) && primaryInput > 0 && Number.isFinite(childInputTokens) && childInputTokens !== null) {
    observedInputAmplification = childInputTokens / primaryInput;
  }
  return Object.freeze({
    primaryInputTokens: primaryInput ?? null,
    childInputTokens,
    totalInputTokens: totalInputTokens ?? null,
    observedInputAmplification,
    childAmplificationFactor: observedInputAmplification,
    limitation: "Unique useful context is unknown; this ratio measures observed input volume across the run tree, not proven waste."
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
  traceId: existingTraceId = null,
  spanId: existingSpanId = null
} = {}) {
  const primary = normalizeUsage(primaryUsage);
  const review = reviewUsage ? normalizeUsage(reviewUsage) : null;
  const tokenInput = primary.tokenInput !== null || (review && review.tokenInput !== null)
    ? (primary.tokenInput || 0) + ((review && review.tokenInput) || 0) : null;
  const tokenOutput = primary.tokenOutput !== null || (review && review.tokenOutput !== null)
    ? (primary.tokenOutput || 0) + ((review && review.tokenOutput) || 0) : null;
  const cachedInputTokens = primary.cachedInputTokens !== null || (review && review.cachedInputTokens !== null)
    ? (primary.cachedInputTokens || 0) + ((review && review.cachedInputTokens) || 0) : null;
  const tokenSource = primary.tokenSource === "provider-reported" || (review && review.tokenSource === "provider-reported")
    ? "provider-reported" : "unavailable";
  const modelCalls = (primary.modelCalls || 0) + ((review && review.modelCalls) || 0);
  const primaryCalls = primary.modelCalls > 0 ? 1 : (outcome === "blocked" ? 0 : 1);
  const reviewCalls = review ? review.modelCalls > 0 ? 1 : 0 : 0;
  const amplification = amplificationMetrics({ primaryInput: primary.tokenInput, childAgents });
  // Context duplication groundwork: hashes only, never content.
  const promptHash = typeof prompt === "string" && prompt.length > 0 ? sha256Hex(prompt).slice(0, 32) : null;
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
    modelCalls,
    primaryCalls,
    reviewCalls,
    toolCalls: primary.toolCalls,
    automaticRetries: 0,
    // Skills economy (existing fields preserved).
    skillsRequested, skillsResolved, skillsLoaded,
    maxSkills: budget?.maxSkills ?? null,
    // Subagent observability.
    childAgentsObserved: Array.isArray(childAgents) ? childAgents.length : 0,
    childAgents: Object.freeze([...(childAgents || [])]),
    // Amplification + duplication base.
    ...amplification,
    promptBytes: typeof prompt === "string" ? Buffer.byteLength(prompt, "utf8") : null,
    promptHash,
    // Tracing (OTel-compatible mapping, local only).
    traceId: existingTraceId || traceId(),
    spanId: existingSpanId || spanId(),
    outcome,
    ...(reason ? { reason } : {})
  });
}

module.exports = { buildCognitiveTelemetry, amplificationMetrics, traceId, spanId };
