"use strict";

/**
 * Observed subagent topology.
 *
 * The Maestro does NOT limit provider-native subagents in this phase; it
 * OBSERVES them when the provider exposes child sessions/agents.
 *
 * Identity rule: NEVER invent an agentId. Events without a provider-reported
 * identifier are recorded as explicit anonymous observations
 * ({ agentId: null, anonymous: true }) so counts never inflate and tokens
 * never misattribute. Anonymous observations never merge with each other.
 *
 * Lifecycle rule: events keyed by real agentId merge across started/usage/
 * completed (first-seen order preserved). Later non-null data fills earlier
 * gaps; known values are never overwritten by unknown/null. Out-of-order
 * events merge the same way.
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
      // Ignore non-JSON noise.
    }
  }
  return events;
}

function outcomeFrom(event) {
  const raw = String(event.status || event.outcome || "");
  if (/complet|success|done/iu.test(raw)) return "completed";
  if (/fail|error/iu.test(raw)) return "failed";
  if (/cancel/iu.test(raw)) return "cancelled";
  return "unknown";
}

function usageFrom(event) {
  const usage = event.usage && typeof event.usage === "object" ? event.usage : null;
  if (!usage) return { tokenInput: null, tokenOutput: null };
  return {
    tokenInput: asNonNegativeInt(usage.input_tokens) ?? asNonNegativeInt(usage.inputTokens) ?? asNonNegativeInt(usage.input),
    tokenOutput: asNonNegativeInt(usage.output_tokens) ?? asNonNegativeInt(usage.outputTokens) ?? asNonNegativeInt(usage.output)
  };
}

function toRecord(state) {
  return Object.freeze({
    runId: state.runId || null,
    executionId: state.executionId || null,
    agentId: state.agentId,
    anonymous: state.agentId === null,
    parentAgentId: state.parentAgentId || null,
    rootAgentId: state.parentAgentId || state.agentId,
    role: state.role || "unknown",
    depth: state.parentAgentId ? null : 1,
    providerNative: true,
    spawnReason: state.spawnReason || null,
    startedAt: state.startedAt || null,
    completedAt: state.completedAt || null,
    tokenInput: state.tokenInput ?? null,
    tokenOutput: state.tokenOutput ?? null,
    outcome: state.outcome || "unknown"
  });
}

function extractChildAgents({ providerId, stdout, runId, executionId } = {}) {
  void providerId;
  try {
    const events = safeJsonLines(stdout);
    if (events.length === 0) return Object.freeze([]);
    const byId = new Map();
    const order = [];
    const anonymous = [];
    for (const event of events) {
      if (!event || typeof event !== "object") continue;
      const type = typeof event.type === "string" ? event.type : "";
      const hasId = asNonEmptyString(event.agent_id)
        || asNonEmptyString(event.agentId)
        || asNonEmptyString(event.child_session_id)
        || asNonEmptyString(event.childSessionId);
      const isAgentType = /^(agent|task|subagent|child)[._-](started|spawned|created|invoked|completed|finished|usage|update)$/iu.test(type)
        || /^(agent|subagent|child)$/iu.test(type)
        || hasId !== null;
      if (!isAgentType) continue;
      const agentId = asNonEmptyString(event.agent_id)
        || asNonEmptyString(event.agentId)
        || asNonEmptyString(event.child_session_id)
        || asNonEmptyString(event.childSessionId);
      // sessionID-only shapes (OpenCode): only treat as agent identity when
      // the event type is agent-scoped; a bare step/session id is not a child.
      const scopedSession = /^(agent|task|subagent|child)/iu.test(type)
        ? (asNonEmptyString(event.sessionID) || null)
        : null;
      const id = agentId || scopedSession;
      const { tokenInput, tokenOutput } = usageFrom(event);
      const outcome = outcomeFrom(event);
      const parentAgentId = asNonEmptyString(event.parent_id)
        || asNonEmptyString(event.parentId)
        || asNonEmptyString(event.parent_session_id)
        || asNonEmptyString(event.parentSessionId)
        || asNonEmptyString(event.parentID)
        || null;
      const role = asNonEmptyString(event.role) || asNonEmptyString(event.lane) || asNonEmptyString(event.agent) || null;
      if (id === null) {
        anonymous.push(toRecord({
          runId, executionId, agentId: null, parentAgentId: null,
          role: role || "unknown",
          spawnReason: asNonEmptyString(event.reason),
          startedAt: asNonEmptyString(event.startedAt),
          completedAt: asNonEmptyString(event.completedAt),
          tokenInput, tokenOutput,
          outcome: outcome === "unknown" ? "unknown" : outcome
        }));
        continue;
      }
      let state = byId.get(id);
      if (!state) {
        state = { runId: runId || null, executionId: executionId || null, agentId: id, parentAgentId: null, role: null, spawnReason: null, startedAt: null, completedAt: null, tokenInput: null, tokenOutput: null, outcome: "unknown" };
        byId.set(id, state);
        order.push(id);
      }
      if (parentAgentId && !state.parentAgentId) state.parentAgentId = parentAgentId;
      if (role && (!state.role || state.role === "unknown")) state.role = role;
      const reason = asNonEmptyString(event.reason);
      if (reason && !state.spawnReason) state.spawnReason = reason;
      const started = asNonEmptyString(event.startedAt);
      if (started && !state.startedAt) state.startedAt = started;
      const completed = asNonEmptyString(event.completedAt);
      if (completed && !state.completedAt) state.completedAt = completed;
      if (tokenInput !== null && tokenInput !== undefined && state.tokenInput === null) state.tokenInput = tokenInput;
      if (tokenOutput !== null && tokenOutput !== undefined && state.tokenOutput === null) state.tokenOutput = tokenOutput;
      if (outcome !== "unknown" && state.outcome === "unknown") state.outcome = outcome;
    }
    return Object.freeze([...order.map((id) => toRecord(byId.get(id))), ...anonymous]);
  } catch {
    return Object.freeze([]);
  }
}

module.exports = { extractChildAgents };
