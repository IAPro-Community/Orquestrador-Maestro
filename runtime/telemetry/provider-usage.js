"use strict";

/**
 * Provider usage parsers behind the adapter contract.
 *
 * Each parser reads provider stdout/stderr (NDJSON event streams or plain
 * text) and returns a normalized, privacy-safe usage record. The rest of the
 * Maestro MUST NOT depend on provider-specific event shapes: unknown events
 * are ignored, malformed lines are skipped, and missing data is reported as
 * `unavailable` (never 0, never invented).
 *
 * Privacy: this module records counts, IDs and model names only. It never
 * returns prompt text, completion text, source code, secrets or file paths.
 *
 * tool != provider != model:
 * - tool/client: the CLI that executed (codex, claude, opencode, agy).
 * - provider: the underlying LLM provider (openai, anthropic, ...) when the
 *   provider exposes it; otherwise "unknown".
 * - model: the model id when exposed; otherwise "unknown".
 * No fragile name-based heuristics are applied: model names are taken
 * verbatim from events or the request, provider is "unknown" unless the
 * event stream states it explicitly.
 */

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asNonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) {
    return Math.floor(Number(value));
  }
  return null;
}

function safeJsonLines(text) {
  const lines = String(text || "").split("\n");
  const events = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") events.push(parsed);
    } catch {
      // Non-JSON line (prompt echo, log noise): ignore, never throw.
    }
  }
  return events;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function emptyUsage(tool) {
  return Object.freeze({
    tool: tool || "unknown",
    provider: "unknown",
    model: "unknown",
    sessionId: null,
    tokenInput: null,
    tokenOutput: null,
    cachedInputTokens: null,
    cachedOutputTokens: null,
    reasoningTokens: null,
    modelCalls: 0,
    toolCalls: null,
    tokenSource: "unavailable",
    usageScope: "unknown",
    usageComplete: false,
    source: "unavailable"
  });
}

function finalize({ tool, provider, model, sessionId, tokenInput, tokenOutput, cachedInputTokens, cachedOutputTokens, reasoningTokens, modelCalls, toolCalls, usageScope, usageComplete = false, source }) {
  const hasTokens = tokenInput !== null || tokenOutput !== null || cachedInputTokens !== null || reasoningTokens !== null;
  return Object.freeze({
    tool: tool || "unknown",
    provider: provider || "unknown",
    model: model || "unknown",
    sessionId: sessionId || null,
    tokenInput: tokenInput ?? null,
    tokenOutput: tokenOutput ?? null,
    cachedInputTokens: cachedInputTokens ?? null,
    cachedOutputTokens: cachedOutputTokens ?? null,
    reasoningTokens: reasoningTokens ?? null,
    modelCalls: Number.isInteger(modelCalls) ? modelCalls : 0,
    toolCalls: toolCalls ?? null,
    tokenSource: hasTokens ? "provider-reported" : "unavailable",
    // usageScope guards against double counting: "aggregate" means the
    // provider total already includes children/history; "self" means only
    // this execution; "unknown" means conservative (never sum blindly).
    usageScope: usageScope || (hasTokens ? "unknown" : "unknown"),
    usageComplete: usageComplete === true,
    source: source || (hasTokens ? "stdout-events" : "unavailable")
  });
}

// Codex `exec --json`: each line carries { type, thread_id, usage?, model? }.
// Usage shapes observed: { input_tokens, cached_input_tokens, output_tokens }
// on turn.completed / thread.completed. Forwards-compatible: any event with
// a `usage` object using those keys is honored; anything else is ignored.
function parseCodexUsage(stdout, { model: requestModel } = {}) {
  const tool = "codex";
  const events = safeJsonLines(stdout);
  if (events.length === 0) return emptyUsage(tool);
  let tokenInput = null;
  let tokenOutput = null;
  let cachedInputTokens = null;
  let reasoningTokens = null;
  let sessionId = null;
  let model = asNonEmptyString(requestModel) && requestModel !== "default" ? requestModel : null;
  let modelCalls = 0;
  let turnCalls = 0;
  let sawAggregate = false;
  let sawThreadUsage = false;
  for (const event of events) {
    const threadId = asNonEmptyString(event.thread_id) || asNonEmptyString(event.threadId) || asNonEmptyString(event.session_id) || asNonEmptyString(event.sessionId);
    if (threadId && !sessionId) sessionId = threadId;
    const eventModel = asNonEmptyString(event.model)
      || asNonEmptyString(event?.item?.model)
      || asNonEmptyString(event?.turn?.model);
    if (eventModel && (!model || model === "unknown")) model = eventModel;
    const usage = event.usage && typeof event.usage === "object" ? event.usage : null;
    // Some Codex builds nest usage under turn/thread payloads.
    const nested = !usage && event.turn && typeof event.turn.usage === "object" ? event.turn.usage
      : !usage && event.thread && typeof event.thread.usage === "object" ? event.thread.usage : null;
    const active = usage || nested;
    if (active) {
      const input = pickFirst(asNonNegativeInt(active.input_tokens), asNonNegativeInt(active.inputTokens), asNonNegativeInt(active.prompt_tokens));
      const output = pickFirst(asNonNegativeInt(active.output_tokens), asNonNegativeInt(active.outputTokens), asNonNegativeInt(active.completion_tokens));
      const cached = pickFirst(asNonNegativeInt(active.cached_input_tokens), asNonNegativeInt(active.cachedInputTokens), asNonNegativeInt(active.cache_read_input_tokens));
      const reasoning = pickFirst(asNonNegativeInt(active.reasoning_tokens), asNonNegativeInt(active.reasoningTokens), asNonNegativeInt(active.reasoning_output_tokens));
      // Event-type accounting (no numeric guessing): a thread.completed usage
      // is the provider's session summary, so it REPLACES as the aggregate
      // total. Per-turn readings are last-wins: we cannot prove whether the
      // provider reports cumulative or delta turns, so we keep the latest
      // observed reading with scope "unknown" instead of fabricating a total
      // by comparison. thread.completed without usage still sets scope only
      // when it carries usage (see below).
      const isThreadSummary = typeof event.type === "string" && /^thread\.completed$/iu.test(event.type);
      if (isThreadSummary) {
        if (input !== null) tokenInput = input;
        if (output !== null) tokenOutput = output;
        if (cached !== null) cachedInputTokens = cached;
        if (reasoning !== null) reasoningTokens = reasoning;
        sawAggregate = true;
        sawThreadUsage = true;
      } else {
        if (input !== null) tokenInput = input;
        if (output !== null) tokenOutput = output;
        if (cached !== null) cachedInputTokens = cached;
        if (reasoning !== null) reasoningTokens = reasoning;
      }
    }
    if (typeof event.type === "string") {
      // thread.completed is the cumulative session summary, not a new model
      // generation: it sets the aggregate scope but never adds a call on top
      // of per-turn counts (avoids double-counting one generation twice).
      if (/^thread\.completed$/iu.test(event.type)) {
        if (active) { sawAggregate = true; sawThreadUsage = true; }
        continue;
      }
      // Only turn.completed counts as a model generation. response.completed
      // is a lifecycle event of the SAME generation (validated against current
      // Codex exec --json shapes): counting both would double-count one call
      // without evidence of an independent generation.
      if (/^turn\.completed$/iu.test(event.type)) {
        turnCalls += 1;
        modelCalls = turnCalls;
      }
    }
  }
  // Fallback: a single JSON object (non-NDJSON) carrying usage directly.
  if (tokenInput === null && events.length === 1) {
    const single = events[0];
    const usage = single.usage && typeof single.usage === "object" ? single.usage : single;
    const input = pickFirst(asNonNegativeInt(usage.input_tokens), asNonNegativeInt(usage.inputTokens));
    const output = pickFirst(asNonNegativeInt(usage.output_tokens), asNonNegativeInt(usage.outputTokens));
    if (input !== null) tokenInput = input;
    if (output !== null) tokenOutput = output;
  }
  // Usage without any per-turn event (thread summary only) still implies one
  // observed generation; report it as such instead of zero.
  if (modelCalls === 0 && sawThreadUsage) modelCalls = 1;
  return finalize({ tool, provider: "unknown", model: model || "unknown", sessionId, tokenInput, tokenOutput, cachedInputTokens, cachedOutputTokens: null, reasoningTokens, modelCalls, toolCalls: null, usageScope: sawAggregate ? "aggregate" : "unknown", usageComplete: sawThreadUsage, source: "stdout-events" });
}

// Claude `--print --output-format stream-json --verbose` (+ agy variant):
// - { type:"system", subtype:"init", session_id, model }
// - { type:"assistant", message:{ model, usage:{ input_tokens,
//   cache_creation_input_tokens, cache_read_input_tokens, output_tokens } } }
// - { type:"result", session_id, usage:{...} }
// Cache creation + cache read are both input-side cache signals; we report
// their sum as cachedInputTokens and keep the raw split out of the schema.
function parseClaudeLikeUsage(stdout, { tool, model: requestModel } = {}) {
  const events = safeJsonLines(stdout);
  if (events.length === 0) return emptyUsage(tool);
  let tokenInput = null;
  let tokenOutput = null;
  let cachedInputTokens = null;
  let sessionId = null;
  let model = asNonEmptyString(requestModel) && requestModel !== "default" ? requestModel : null;
  let modelCalls = 0;
  let toolCalls = 0;
  let sawToolUse = false;
  let sawAggregate = false;
  let sawResultUsage = false;
  for (const event of events) {
    const sid = asNonEmptyString(event.session_id) || asNonEmptyString(event.sessionId);
    if (sid && !sessionId) sessionId = sid;
    const eventModel = asNonEmptyString(event.model) || asNonEmptyString(event?.message?.model);
    if (eventModel && (!model || model === "unknown")) model = eventModel;
    const usage = event.usage && typeof event.usage === "object" ? event.usage
      : event?.message?.usage && typeof event.message.usage === "object" ? event.message.usage : null;
    if (usage) {
      const input = pickFirst(asNonNegativeInt(usage.input_tokens), asNonNegativeInt(usage.inputTokens));
      const output = pickFirst(asNonNegativeInt(usage.output_tokens), asNonNegativeInt(usage.outputTokens));
      // Explicit zero is preserved: cache fields present (even as 0) yield a
      // numeric cached total; absent fields leave cached unknown (null).
      const readRaw = pickFirst(asNonNegativeInt(usage.cache_read_input_tokens), asNonNegativeInt(usage.cached_input_tokens));
      const createRaw = asNonNegativeInt(usage.cache_creation_input_tokens);
      const cached = readRaw !== null || createRaw !== null ? (readRaw || 0) + (createRaw || 0) : null;
      if (input !== null) tokenInput = tokenInput === null ? input : Math.max(tokenInput, input);
      if (output !== null) tokenOutput = tokenOutput === null ? output : Math.max(tokenOutput, output);
      if (cached !== null) cachedInputTokens = cachedInputTokens === null ? cached : Math.max(cachedInputTokens, cached);
      // A result event carries the cumulative totals for the turn.
      if (event.type === "result") {
        modelCalls += 1;
        if (usage) {
          sawAggregate = true;
          sawResultUsage = true;
        }
      }
    }
    // Tool-use counting is best-effort: assistant content blocks with
    // type tool_use. Unreliable streams leave toolCalls null (see below).
    const content = event?.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && block.type === "tool_use") {
          toolCalls += 1;
          sawToolUse = true;
        }
      }
    }
    if (event?.content_block?.type === "tool_use") {
      toolCalls += 1;
      sawToolUse = true;
    }
  }
  return finalize({
    tool, provider: "unknown", model: model || "unknown", sessionId,
    tokenInput, tokenOutput, cachedInputTokens, cachedOutputTokens: null,
    reasoningTokens: null, modelCalls, toolCalls: sawToolUse ? toolCalls : null,
    usageScope: sawAggregate ? "aggregate" : "unknown",
    usageComplete: sawResultUsage,
    source: "stdout-events"
  });
}

// OpenCode `run --format json`: event shapes vary by version; honored keys:
// - sessionID/session_id, modelID/model, providerID/provider
// - tokens: { input, output, cache, reasoning } or { input_tokens, ... }
// - cost / token deltas on step_finish.
// Unknown shapes are ignored; provider/model are taken verbatim when stated.
function parseOpenCodeUsage(stdout, { model: requestModel } = {}) {
  const tool = "opencode";
  const events = safeJsonLines(stdout);
  if (events.length === 0) return emptyUsage(tool);
  let tokenInput = 0, tokenOutput = 0, cachedInputTokens = 0, cachedOutputTokens = 0, reasoningTokens = 0;
  let sawInput = false, sawOutput = false, sawCacheRead = false, sawCacheWrite = false, sawReasoning = false;
  let sessionId = null;
  let model = asNonEmptyString(requestModel) && requestModel !== "default" ? requestModel : null;
  let provider = "unknown", modelCalls = 0, toolCalls = 0, sawToolCalls = false, lastLifecycleEvent = null;
  let sawSubagent = false;
  const childSessionIds = new Set();
  const stepFinishSessionIds = new Set();
  for (const event of events) {
    const sid = asNonEmptyString(event.sessionID) || asNonEmptyString(event.session_id) || asNonEmptyString(event.sessionId);
    if (sid && !sessionId) sessionId = sid;
    const mid = asNonEmptyString(event.modelID) || asNonEmptyString(event.model) || asNonEmptyString(event?.part?.model) || asNonEmptyString(event?.message?.model);
    if (mid && (!model || model === "unknown")) model = mid;
    const pid = asNonEmptyString(event.providerID) || asNonEmptyString(event.provider);
    if (pid) provider = pid;
    const eventType = typeof event.type === "string" ? event.type : "";
    const partType = typeof event?.part?.type === "string" ? event.part.type : "";
    const toolName = asNonEmptyString(event?.part?.tool) || asNonEmptyString(event?.tool);
    const childSessionId = asNonEmptyString(event?.part?.state?.metadata?.sessionId)
      || asNonEmptyString(event?.part?.state?.metadata?.sessionID);
    if (toolName === "task") {
      sawSubagent = true;
      if (childSessionId) childSessionIds.add(childSessionId);
    }
    const isStepFinish = /^(step_finish|step-finish|step\.finish)$/iu.test(eventType) || /^(step_finish|step-finish|step\.finish)$/iu.test(partType);
    const isStepStart = /^(step_start|step-start|step\.start)$/iu.test(eventType) || /^(step_start|step-start|step\.start)$/iu.test(partType);
    const isPayloadActivity = /^(text|tool|tool_call|tool-result|tool_use)$/iu.test(eventType) || /^(text|tool|tool_use)$/iu.test(partType);
    if (isStepStart) lastLifecycleEvent = "step-start";
    else if (isPayloadActivity) lastLifecycleEvent = "payload";
    else if (isStepFinish) lastLifecycleEvent = "step-finish";
    if (isStepFinish) {
      if (sid) stepFinishSessionIds.add(sid);
      const tokens = event?.part?.tokens && typeof event.part.tokens === "object" ? event.part.tokens : event.tokens && typeof event.tokens === "object" ? event.tokens : event.usage && typeof event.usage === "object" ? event.usage : null;
      if (tokens) {
        const input = pickFirst(asNonNegativeInt(tokens.input), asNonNegativeInt(tokens.input_tokens), asNonNegativeInt(tokens.inputTokens), asNonNegativeInt(tokens.prompt_tokens));
        const output = pickFirst(asNonNegativeInt(tokens.output), asNonNegativeInt(tokens.output_tokens), asNonNegativeInt(tokens.outputTokens), asNonNegativeInt(tokens.completion_tokens));
        const reasoning = pickFirst(asNonNegativeInt(tokens.reasoning), asNonNegativeInt(tokens.reasoning_tokens));
        const cache = tokens.cache && typeof tokens.cache === "object" ? tokens.cache : null;
        const read = pickFirst(cache ? asNonNegativeInt(cache.read) : null, asNonNegativeInt(tokens.cache), asNonNegativeInt(tokens.cached), asNonNegativeInt(tokens.cached_input_tokens), asNonNegativeInt(tokens.cache_read_input_tokens));
        const write = pickFirst(cache ? asNonNegativeInt(cache.write) : null, asNonNegativeInt(tokens.cache_write_input_tokens));
        if (input !== null) { tokenInput += input; sawInput = true; }
        if (output !== null) { tokenOutput += output; sawOutput = true; }
        if (reasoning !== null) { reasoningTokens += reasoning; sawReasoning = true; }
        if (read !== null) { cachedInputTokens += read; sawCacheRead = true; }
        if (write !== null) { cachedOutputTokens += write; sawCacheWrite = true; }
        modelCalls += 1;
      }
    }
    if (/^(tool|tool_use|tool-use|function_call)$/iu.test(partType)) { toolCalls += 1; sawToolCalls = true; }
  }
  const childUsageComplete = !sawSubagent
    || (childSessionIds.size > 0 && [...childSessionIds].every((id) => stepFinishSessionIds.has(id)));
  return finalize({
    tool, provider, model: model || "unknown", sessionId,
    tokenInput: sawInput ? tokenInput : null,
    tokenOutput: sawOutput ? tokenOutput : null,
    cachedInputTokens: sawCacheRead ? cachedInputTokens : null,
    cachedOutputTokens: sawCacheWrite ? cachedOutputTokens : null,
    reasoningTokens: sawReasoning ? reasoningTokens : null,
    modelCalls, toolCalls: sawToolCalls ? toolCalls : null,
    usageScope: sawSubagent && childUsageComplete ? "aggregate" : modelCalls > 0 ? "self" : "unknown",
    usageComplete: modelCalls > 0 && lastLifecycleEvent === "step-finish" && childUsageComplete,
    source: "stdout-events"
  });
}

function parseProviderUsage({ providerId, stdout, stderr, model } = {}) {
  const id = String(providerId || "").toLowerCase();
  try {
    if (id === "codex") return parseCodexUsage(stdout, { model });
    if (id === "claude") return parseClaudeLikeUsage(stdout, { tool: "claude", model });
    if (id === "agy") return parseClaudeLikeUsage(stdout, { tool: "agy", model });
    if (id === "opencode") return parseOpenCodeUsage(stdout, { model });
    // Unknown tool: attempt generic extraction without inventing attribution.
    const events = safeJsonLines(stdout);
    if (events.length === 0) return emptyUsage(id || "unknown");
    // Generic fallback honors only explicit usage-shaped objects.
    let tokenInput = null;
    let tokenOutput = null;
    let sessionId = null;
    for (const event of events) {
      const sid = asNonEmptyString(event.session_id) || asNonEmptyString(event.sessionId) || asNonEmptyString(event.sessionID);
      if (sid && !sessionId) sessionId = sid;
      const usage = event.usage && typeof event.usage === "object" ? event.usage : null;
      if (usage) {
        const input = pickFirst(asNonNegativeInt(usage.input_tokens), asNonNegativeInt(usage.inputTokens), asNonNegativeInt(usage.input));
        const output = pickFirst(asNonNegativeInt(usage.output_tokens), asNonNegativeInt(usage.outputTokens), asNonNegativeInt(usage.output));
        if (input !== null) tokenInput = tokenInput === null ? input : Math.max(tokenInput, input);
        if (output !== null) tokenOutput = tokenOutput === null ? output : Math.max(tokenOutput, output);
      }
    }
    void stderr;
    return finalize({ tool: id || "unknown", provider: "unknown", model: asNonEmptyString(model) && model !== "default" ? model : "unknown", sessionId, tokenInput, tokenOutput, cachedInputTokens: null, cachedOutputTokens: null, reasoningTokens: null, modelCalls: 0, toolCalls: null, source: "stdout-events" });
  } catch {
    return emptyUsage(String(providerId || "unknown").toLowerCase() || "unknown");
  }
}

module.exports = { parseProviderUsage, parseCodexUsage, parseClaudeLikeUsage, parseOpenCodeUsage, emptyUsage };
