"use strict";

const { observesNativeGoalCommand, NATIVE_GOAL_GUIDANCE } = require("../../providers/goal-preflight");

const EVENTS = Object.freeze({
  codex: Object.freeze({ UserPromptSubmit: "prompt", Stop: "turn-end" }),
  claude: Object.freeze({ UserPromptSubmit: "prompt", Stop: "turn-end" }),
  gemini: Object.freeze({ BeforeAgent: "prompt", AfterAgent: "turn-end" }),
  opencode: Object.freeze({ prompt: "prompt" })
});

// Only trusted host entrypoints choose the host; payloads cannot choose it.
// A turn boundary or literal slash command is never Goal lifecycle evidence.
function observeHarnessEvent(host, event) {
  if (!Object.hasOwn(EVENTS, host) || !event || typeof event !== "object" || Array.isArray(event)) return null;
  const name = event.hook_event_name;
  if (typeof name !== "string" || !Object.hasOwn(EVENTS[host], name)) return null;
  const kind = EVENTS[host][name];
  const commandObserved = kind === "prompt" && observesNativeGoalCommand(event.prompt);
  return Object.freeze({
    schemaVersion: 1, host, kind, commandObserved,
    continuationOwner: "external-host", goalState: "unknown",
    verification: "not-performed", dispatchAllowed: false,
    guidance: commandObserved ? NATIVE_GOAL_GUIDANCE : null
  });
}

function hookResponse(host, event) {
  const observed = observeHarnessEvent(host, event);
  if (!observed?.guidance) return {};
  const output = { additionalContext: observed.guidance };
  if (host === "claude" || host === "codex") output.hookEventName = event.hook_event_name;
  if (host !== "claude" && host !== "codex" && host !== "gemini") return {};
  return { hookSpecificOutput: output };
}

// OpenCode V2 prompt admission is observation-only. Never edit the persisted
// user prompt, command registration, tool permissions, retry or inbox state.
// Context is a fresh request: append at most one short block per request.
function createOpenCodeHooks() {
  const observedSessions = new Map();
  const limit = 256;
  return {
    prompt(event) {
      const id = event?.sessionID;
      if (typeof id !== "string" || !id || id.length > 256) return;
      const observation = observeHarnessEvent("opencode", { hook_event_name: "prompt", prompt: event?.prompt?.text });
      observedSessions.delete(id);
      if (!observation?.commandObserved) return;
      observedSessions.set(id, observation.guidance);
      if (observedSessions.size > limit) observedSessions.delete(observedSessions.keys().next().value);
    },
    context(event) {
      const guidance = observedSessions.get(event?.sessionID);
      if (!guidance || !Array.isArray(event.system)) return;
      if (!event.system.some((part) => part?.type === "text" && part.text === guidance)) {
        event.system.push({ type: "text", text: guidance });
      }
    },
    dispose() { observedSessions.clear(); }
  };
}

module.exports = { EVENTS, observeHarnessEvent, hookResponse, createOpenCodeHooks };
