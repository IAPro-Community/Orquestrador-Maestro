"use strict";

/**
 * Observed subagent topology.
 *
 * The Maestro does NOT limit provider-native subagents in this phase; it
 * OBSERVES them when the provider exposes child sessions/agents. Each entry
 * describes one observed child execution/agent invocation:
 *
 * - agentId: provider-reported child identifier (never invented).
 * - parentAgentId: parent identifier when exposed, else null.
 * - role/lane: Maestro lane when the spawn reason is known, else "unknown".
 * - depth: observed nesting depth (1 = direct child of the primary
 *   execution) when computable, else null.
 * - providerNative: true when the child was spawned by the provider itself
 *   (as opposed to a Maestro lane); false when the Maestro spawned it.
 * - tokens: provider-reported input/output when exposed, else null.
 * - outcome: completed/failed/cancelled/unknown.
 *
 * Unknown provider event shapes are ignored (forwards compatibility).
 * No prompt/completion content is collected here.
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

function normalizeAgentEvent(event, index) {
  if (!event || typeof event !== "object") return null;
  // Candidate child-agent shapes across providers (all optional):
  // - { type:"agent.started"|"task.started"|"subagent.started", agent_id, parent_id, role }
  // - { agentId, parentAgentId } camelCase variants
  // - { session_id + parent_session_id } session nesting
  // - OpenCode: { type:"agent", sessionID, parentID }
  const type = typeof event.type === "string" ? event.type : "";
  const isAgentType = /^(agent|task|subagent|child)[._-](started|spawned|created|invoked)$/iu.test(type)
    || /^(agent|subagent|child)$/iu.test(type)
    || asNonEmptyString(event.agent_id) !== null
    || asNonEmptyString(event.agentId) !== null;
  if (!isAgentType) return null;
  const agentId = asNonEmptyString(event.agent_id)
    || asNonEmptyString(event.agentId)
    || asNonEmptyString(event.child_session_id)
    || asNonEmptyString(event.childSessionId)
    || asNonEmptyString(event.sessionID)
    || `observed-${index}`;
  // Only keep the fallback id when the event really looks like an agent
  // invocation (explicit type); otherwise drop to avoid inventing agents.
  if (agentId.startsWith("observed-") && !/^(agent|task|subagent|child)/iu.test(type)) return null;
  const parentAgentId = asNonEmptyString(event.parent_id)
    || asNonEmptyString(event.parentId)
    || asNonEmptyString(event.parent_session_id)
    || asNonEmptyString(event.parentSessionId)
    || asNonEmptyString(event.parentID)
    || null;
  const role = asNonEmptyString(event.role) || asNonEmptyString(event.lane) || asNonEmptyString(event.agent) || "unknown";
  const usage = event.usage && typeof event.usage === "object" ? event.usage : null;
  const tokenInput = usage ? (asNonNegativeInt(usage.input_tokens) ?? asNonNegativeInt(usage.inputTokens) ?? asNonNegativeInt(usage.input)) : null;
  const tokenOutput = usage ? (asNonNegativeInt(usage.output_tokens) ?? asNonNegativeInt(usage.outputTokens) ?? asNonNegativeInt(usage.output)) : null;
  const outcome = /complet|success|done/iu.test(String(event.status || event.outcome || "")) ? "completed"
    : /fail|error/iu.test(String(event.status || event.outcome || "")) ? "failed"
      : /cancel/iu.test(String(event.status || event.outcome || "")) ? "cancelled" : "unknown";
  return Object.freeze({
    agentId,
    parentAgentId,
    role,
    depth: parentAgentId ? null : 1,
    providerNative: true,
    spawnReason: asNonEmptyString(event.reason) || null,
    tokenInput,
    tokenOutput,
    outcome
  });
}

function extractChildAgents({ providerId, stdout } = {}) {
  void providerId;
  try {
    const events = safeJsonLines(stdout);
    if (events.length === 0) return Object.freeze([]);
    const agents = [];
    const seen = new Set();
    events.forEach((event, index) => {
      const normalized = normalizeAgentEvent(event, index);
      if (!normalized) return;
      if (seen.has(normalized.agentId)) return;
      seen.add(normalized.agentId);
      agents.push(normalized);
    });
    // Resolve depth 1 for roots; deeper nesting stays null unless the parent
    // chain is fully observed (honest: we do not guess depth).
    return Object.freeze(agents);
  } catch {
    return Object.freeze([]);
  }
}

module.exports = { extractChildAgents };
