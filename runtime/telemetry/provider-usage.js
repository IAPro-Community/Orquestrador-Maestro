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
    source: "unavailable"
  });
}

function finalize({ tool, provider, model, sessionId, tokenInput, tokenOutput, cachedInputTokens, cachedOutputTokens, reasoningTokens, modelCalls, toolCalls, usageScope, source }) {
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
      // Last usage wins when the stream reports cumulative totals; when it
      // reports per-turn deltas we sum. Heuristic: if the new input is >= the
      // accumulated input, treat as cumulative (replace); else sum.
      if (input !== null) {
        tokenInput = tokenInput === null ? input : (input >= tokenInput ? input : tokenInput + input);
      }
      if (output !== null) {
        tokenOutput = tokenOutput === null ? output : (output >= tokenOutput ? output : tokenOutput + output);
      }
      if (cached !== null) {
        cachedInputTokens = cachedInputTokens === null ? cached : (cached >= cachedInputTokens ? cached : cachedInputTokens + cached);
      }
      if (reasoning !== null) {
        reasoningTokens = reasoningTokens === null ? reasoning : Math.max(reasoningTokens, reasoning);
      }
    }
    if (typeof event.type === "string" && /^(turn\.completed|thread\.completed|response\.completed)$/iu.test(event.type)) {
      // thread.completed is the cumulative session summary, not a new model
      // generation: it sets the aggregate scope but never adds a call on top
      // of per-turn counts (avoids double-counting one generation twice).
      if (/^thread\.completed$/iu.test(event.type)) {
        if (active) { sawAggregate = true; sawThreadUsage = true; }
        continue;
      }
      turnCalls += 1;
      modelCalls = turnCalls;
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
  return finalize({ tool, provider: "unknown", model: model || "unknown", sessionId, tokenInput, tokenOutput, cachedInputTokens, cachedOutputTokens: null, reasoningTokens, modelCalls, toolCalls: null, usageScope: sawAggregate ? "aggregate" : "unknown", source: "stdout-events" });
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
        if (usage) sawAggregate = true;
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
  let tokenInput = null;
  let tokenOutput = null;
  let cachedInputTokens = null;
  let reasoningTokens = null;
  let sessionId = null;
  let model = asNonEmptyString(requestModel) && requestModel !== "default" ? requestModel : null;
  let provider = "unknown";
  let modelCalls = 0;
  let toolCalls = 0;
  let sawToolCalls = false;
  for (const event of events) {
    const sid = asNonEmptyString(event.sessionID) || asNonEmptyString(event.session_id) || asNonEmptyString(event.sessionId);
    if (sid && !sessionId) sessionId = sid;
    const mid = asNonEmptyString(event.modelID) || asNonEmptyString(event.model) || asNonEmptyString(event?.part?.model) || asNonEmptyString(event?.message?.model);
    if (mid && (!model || model === "unknown")) model = mid;
    const pid = asNonEmptyString(event.providerID) || asNonEmptyString(event.provider);
    if (pid) provider = pid;
    const tokens = event.tokens && typeof event.tokens === "object" ? event.tokens
      : event.usage && typeof event.usage === "object" ? event.usage
      : event?.part?.tokens && typeof event.part.tokens === "object" ? event.part.tokens : null;
    if (tokens) {
      const input = pickFirst(asNonNegativeInt(tokens.input), asNonNegativeInt(tokens.input_tokens), asNonNegativeInt(tokens.inputTokens), asNonNegativeInt(tokens.prompt_tokens));
      const output = pickFirst(asNonNegativeInt(tokens.output), asNonNegativeInt(tokens.output_tokens), asNonNegativeInt(tokens.outputTokens), asNonNegativeInt(tokens.completion_tokens));
      const cached = pickFirst(asNonNegativeInt(tokens.cache), asNonNegativeInt(tokens.cached), asNonNegativeInt(tokens.cached_input_tokens), asNonNegativeInt(tokens.cache_read_input_tokens));
      const reasoning = pickFirst(asNonNegativeInt(tokens.reasoning), asNonNegativeInt(tokens.reasoning_tokens));
      if (input !== null) tokenInput = tokenInput === null ? input : Math.max(tokenInput, input);
      if (output !== null) tokenOutput = tokenOutput === null ? output : Math.max(tokenOutput, output);
      if (cached !== null) cachedInputTokens = cachedInputTokens === null ? cached : Math.max(cachedInputTokens, cached);
      if (reasoning !== null) reasoningTokens = reasoningTokens === null ? reasoning : Math.max(reasoningTokens, reasoning);
    }
    if (typeof event.type === "string" && /^(step_finish|step\.finish|message\.finish|turn\.finish)$/iu.test(event.type)) {
      modelCalls += 1;
    }
    // Best-effort tool counting: explicit tool part types only.
    const partType = event?.part?.type;
    if (typeof partType === "string" && /^(tool|tool_use|tool-use|function_call)$/iu.test(partType)) {
      toolCalls += 1;
      sawToolCalls = true;
    }
  }
  return finalize({ tool, provider, model: model || "unknown", sessionId, tokenInput, tokenOutput, cachedInputTokens, cachedOutputTokens: null, reasoningTokens, modelCalls, toolCalls: sawToolCalls ? toolCalls : null, source: "stdout-events" });
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
