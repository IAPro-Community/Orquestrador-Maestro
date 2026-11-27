"use strict";

const { observesNativeGoalCommand, NATIVE_GOAL_GUIDANCE } = require("../../providers/goal-preflight");

const SURFACES = Object.freeze(["cli", "tui", "ide", "desktop", "headless", "api", "unknown"]);
const DEFAULT_UNAVAILABILITY = Object.freeze([
  "GOAL_LIFECYCLE_NOT_OBSERVABLE",
  "INDEPENDENT_VERIFICATION_NOT_RUN"
]);

const EVENTS = Object.freeze({
  codex: Object.freeze({
    SessionStart: "session-start",
    UserPromptSubmit: "prompt",
    Stop: "turn-end",
    SessionEnd: "session-end"
  }),
  claude: Object.freeze({
    SessionStart: "session-start",
    UserPromptSubmit: "prompt",
    Stop: "turn-end",
    SessionEnd: "session-end"
  }),
  gemini: Object.freeze({
    SessionStart: "session-start",
    BeforeAgent: "prompt",
    AfterAgent: "turn-end",
    SessionEnd: "session-end"
  }),
  opencode: Object.freeze({
    prompt: "prompt",
    "experimental.idle": "turn-end",
    dispose: "session-end"
  })
});

function boundedString(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function normalizeSurface(surface) {
  const candidate = typeof surface === "string" ? surface.trim().toLowerCase() : "unknown";
  return SURFACES.includes(candidate) ? candidate : "unknown";
}

/**
 * Normalize an external harness event without trusting host payload assertions.
 * Only trusted host entrypoints choose `host`; payloads cannot elevate authority.
 * A turn boundary, idle notice, or literal `/goal` text is never Goal lifecycle evidence.
 */
function observeHarnessEvent(host, event, meta = {}) {
  if (!Object.hasOwn(EVENTS, host) || !event || typeof event !== "object" || Array.isArray(event)) return null;
  const name = event.hook_event_name;
  if (typeof name !== "string" || !Object.hasOwn(EVENTS[host], name)) return null;
  const kind = EVENTS[host][name];
  const commandObserved = kind === "prompt" && observesNativeGoalCommand(event.prompt);
  const surface = normalizeSurface(meta?.surface);
  const hostVersion = boundedString(meta?.hostVersion, 128);
  const sessionId = boundedString(event.session_id ?? event.sessionID ?? meta?.sessionId, 256);
  const turnId = boundedString(event.turn_id ?? event.messageID ?? meta?.turnId, 128);
  return Object.freeze({
    schemaVersion: 1,
    host,
    surface,
    hostVersion,
    kind,
    eventName: name,
    sessionId,
    turnId,
    commandObserved,
    continuationOwner: "external-host",
    goalState: "unknown",
    verification: "not-performed",
    dispatchAllowed: false,
    unavailabilityReasons: DEFAULT_UNAVAILABILITY,
    guidance: commandObserved ? NATIVE_GOAL_GUIDANCE : null
  });
}

/**
 * Determine continuation ownership under the single-authority invariant:
 * - Never start a competing Maestro loop when the external host has an active or observed native Goal.
 * - Fail closed whenever authority, version, authorization, or certification is missing.
 */
function evaluateContinuationAuthority({
  host = null,
  surface = "unknown",
  installed = false,
  version = null,
  nativeGoalObserved = false,
  nativeGoalActive = false,
  nativeGoalControllerSupported = false,
  requestedOwner = "native-provider",
  managedAuthorized = false,
  managedCertified = false
} = {}) {
  const normalizedSurface = normalizeSurface(surface);
  if (nativeGoalActive === true) {
    return Object.freeze({
      schemaVersion: 1,
      host,
      surface: normalizedSurface,
      owner: "native-provider",
      competingLoopBlocked: true,
      dispatchAllowed: false,
      reason: "NATIVE_GOAL_ACTIVE_HOST_OWNS_CONTINUATION"
    });
  }
  if (nativeGoalObserved === true && nativeGoalControllerSupported !== true) {
    return Object.freeze({
      schemaVersion: 1,
      host,
      surface: normalizedSurface,
      owner: "native-provider",
      competingLoopBlocked: true,
      dispatchAllowed: false,
      reason: "NATIVE_GOAL_COMMAND_OBSERVED_PRESERVE_HOST"
    });
  }
  if (!installed) {
    return Object.freeze({
      schemaVersion: 1,
      host,
      surface: normalizedSurface,
      owner: null,
      competingLoopBlocked: false,
      dispatchAllowed: false,
      reason: "PROVIDER_NOT_INSTALLED"
    });
  }
  if (!boundedString(version, 128)) {
    return Object.freeze({
      schemaVersion: 1,
      host,
      surface: normalizedSurface,
      owner: null,
      competingLoopBlocked: false,
      dispatchAllowed: false,
      reason: "PROVIDER_VERSION_UNVERIFIED"
    });
  }
  if (requestedOwner === "maestro-managed") {
    if (managedAuthorized === true && managedCertified === true) {
      return Object.freeze({
        schemaVersion: 1,
        host,
        surface: normalizedSurface,
        owner: "maestro-managed",
        competingLoopBlocked: false,
        dispatchAllowed: true,
        reason: "MANAGED_MODE_AUTHORIZED_AND_CERTIFIED"
      });
    }
    return Object.freeze({
      schemaVersion: 1,
      host,
      surface: normalizedSurface,
      owner: null,
      competingLoopBlocked: true,
      dispatchAllowed: false,
      reason: managedAuthorized ? "MANAGED_GOAL_LOOP_NOT_CERTIFIED" : "GOAL_AUTONOMY_DISABLED"
    });
  }
  return Object.freeze({
    schemaVersion: 1,
    host,
    surface: normalizedSurface,
    owner: null,
    competingLoopBlocked: true,
    dispatchAllowed: false,
    reason: nativeGoalControllerSupported ? "NATIVE_GOAL_CONTROLLER_READY" : "NATIVE_GOAL_UNSUPPORTED"
  });
}

function hookResponse(host, event, options = {}) {
  const observed = observeHarnessEvent(host, event);
  if (!observed || !["claude", "codex", "gemini"].includes(host)) return {};
  let guidance = observed.guidance;
  if (!guidance && observed.kind === "prompt" && options.routeNative === true &&
      ["claude", "gemini"].includes(host)) {
    const { nativeRoutingGuidance } = require("./routing");
    guidance = nativeRoutingGuidance(event.prompt, event.cwd, options);
  }
  if (!guidance) return {};
  const output = { additionalContext: guidance };
  if (host === "claude" || host === "codex") output.hookEventName = event.hook_event_name;
  if (host !== "claude" && host !== "codex" && host !== "gemini") return {};
  return { hookSpecificOutput: output };
}

// Route the user message actually present in the outgoing primary context,
// not the most recently admitted prompt (which may still be queued).
// The bounded cache contains only IDs, workspace paths and compact guidance.
// Never mutate stored messages, permissions, delivery, retry or Goal state.
function createOpenCodeHooks(options = {}) {
  const observedSessions = new Map();
  const routes = new Map();
  const limit = 256;
  function put(map, key, value) {
    map.delete(key);
    map.set(key, value);
    if (map.size > limit) map.delete(map.keys().next().value);
  }
  return {
    prompt(event) {
      const id = boundedString(event?.sessionID, 256);
      if (!id) return;
      const observation = observeHarnessEvent("opencode", {
        hook_event_name: "prompt",
        prompt: event?.prompt?.text,
        sessionID: id,
        messageID: event?.messageID
      }, { surface: "tui" });
      observedSessions.delete(id);
      if (observation?.commandObserved) put(observedSessions, id, Object.freeze({
        guidance: observation.guidance, lastIdleAt: null, goalState: "unknown"
      }));
    },
    context(event, cwd) {
      const id = boundedString(event?.sessionID, 256);
      if (!id || !Array.isArray(event?.system) || !Array.isArray(event?.messages)) return;
      // No user message after an idle/location change means no proven active
      // prompt. A compacted transcript without that message uses static rules.
      let user;
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const message = event.messages[i];
        if (["idle", "location-switched"].includes(message?.type)) break;
        if (message?.type === "user") { user = message; break; }
      }
      const messageId = boundedString(user?.id, 128);
      if (!messageId || typeof user?.text !== "string") return;
      let guidance;
      if (observesNativeGoalCommand(user.text)) {
        guidance = NATIVE_GOAL_GUIDANCE;
      } else if (options.routeNative === true && typeof cwd === "string" && require("node:path").isAbsolute(cwd)) {
        const key = JSON.stringify([id, messageId, cwd]);
        if (!routes.has(key)) {
          const { nativeRoutingGuidance } = require("./routing");
          put(routes, key, nativeRoutingGuidance(user.text, cwd, options));
        }
        guidance = routes.get(key);
      }
      if (guidance && !event.system.some(part => part?.type === "text" && part.text === guidance)) {
        event.system.push({ type: "text", text: guidance });
      }
    },
    idle(event) {
      // Idle is not Goal completion or proof of acceptance.
      const id = event?.sessionID;
      if (typeof id !== "string" || !observedSessions.has(id)) return;
      put(observedSessions, id, Object.freeze({
        ...observedSessions.get(id), lastIdleAt: new Date().toISOString(), goalState: "unknown"
      }));
    },
    getObservedState(sessionId) {
      return observedSessions.get(sessionId) || null;
    },
    dispose() { observedSessions.clear(); routes.clear(); }
  };
}

module.exports = {
  EVENTS,
  SURFACES,
  observeHarnessEvent,
  evaluateContinuationAuthority,
  hookResponse,
  createOpenCodeHooks
};
