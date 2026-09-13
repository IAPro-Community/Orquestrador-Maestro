"use strict";

const FAMILIES_TYPES = Object.freeze({
  "runtime.*": Object.freeze(["runtime.started", "runtime.status", "runtime.health", "runtime.shutdown", "runtime.disconnected", "runtime.reconnected", "runtime.retry"]),
  "project.*": Object.freeze(["project.created", "project.status.changed"]),
  "mission.*": Object.freeze(["mission.created", "mission.updated"]),
  "plan.*": Object.freeze(["plan.approved", "plan.auto_approved", "plan.rejected", "plan.persisted", "batch.question.asked", "batch.question.answered"]),
  "task.*": Object.freeze(["task.ready", "task.started", "task.verifying", "task.failed", "task.blocked", "task.completed", "run.created", "run.started", "run.cancel_requested", "run.completed", "run.failed", "run.attachPty", "run.output", "artifact.created"]),
  "agent.*": Object.freeze(["agentSession.created", "agentSession.output", "agentSession.active", "agentSession.exited", "agentSession.closed", "agentSession.disconnected", "provider.started", "provider.output", "provider.completed"]),
  "terminal.*": Object.freeze(["terminal.session_created", "terminal.session_started", "terminal.session_closed", "pane.updated"]),
  "verification.*": Object.freeze(["verification.completed", "verification.failed"]),
  "attention.*": Object.freeze(["attention.created", "attention.snoozed", "attention.resolved"]),
  "skill.*": Object.freeze([])
});

const RESERVED_FAMILIES = Object.freeze(["skill.*"]);
const TYPE_TO_FAMILY = new Map();
for (const [family, types] of Object.entries(FAMILIES_TYPES)) {
  for (const type of types) {
    if (TYPE_TO_FAMILY.has(type)) throw new Error(`duplicate event type: ${type}`);
    TYPE_TO_FAMILY.set(type, family);
  }
}

function familyOf(type) {
  const family = TYPE_TO_FAMILY.get(type);
  if (!family) {
    const error = new Error(`Unknown event family for type: ${String(type)}`);
    error.code = "UNKNOWN_EVENT_FAMILY";
    throw error;
  }
  return family;
}

module.exports = { FAMILIES_TYPES, RESERVED_FAMILIES, familyOf };
