"use strict";

/**
 * Conservative provider Goal preflight for issue #67.
 * Native /goal in a TUI is NOT proof of lifecycle control by our headless
 * adapter. This module never starts a provider or a second orchestration loop.
 */
const GOAL_CONTROLS = Object.freeze([
  "create", "observe", "pause", "resume", "cancel",
  "attach", "recover", "budget", "evidence", "headless"
]);
const GOAL_PROVIDERS = new Set(["codex", "claude", "opencode"]);

// A slash command delivered to a host hook is an observation, not proof that a
// Goal was created, is active, or has finished. Do not parse vendor subcommands
// or infer execution authority from prompt text.
function observesNativeGoalCommand(prompt) {
  return typeof prompt === "string" && /^\/goal(?:\s|$)/u.test(prompt.trim());
}

const NATIVE_GOAL_GUIDANCE = "Native Goal command observed (state unverified). Preserve the host's continuation; do not launch a competing loop. Verify acceptance criteria with independent evidence before claiming completion.";

async function inspectProviderGoal(adapter, { surface = "headless" } = {}) {
  if (!adapter || typeof adapter.id !== "string" ||
      typeof adapter.detect !== "function" ||
      typeof adapter.capabilities !== "function") {
    throw new TypeError("a concrete Maestro provider adapter is required");
  }
  if (!["headless", "cli", "tui", "ide", "desktop", "api"].includes(surface)) {
    throw new TypeError("unsupported provider surface");
  }
  let detection;
  let standardCapabilities;
  try { detection = await adapter.detect(); } catch { detection = null; }
  try { standardCapabilities = await adapter.capabilities(); } catch { standardCapabilities = null; }
  const installed = detection?.installed === true;
  const version = typeof detection?.version === "string" && detection.version.trim() &&
      detection.version.length <= 128 ? detection.version.trim() : null;
  // The current provider adapters implement single headless process
  // execution, but do not implement a native Goal controller/session.
  // "unknown" here describes the vendor's capability, "unsupported"
  // describes the present Maestro adapter's integration.
  const capabilityState = installed && GOAL_PROVIDERS.has(adapter.id)
    ? "unknown" : "unsupported";
  return Object.freeze({
    schemaVersion: 1,
    providerId: adapter.id,
    installed, version, surface,
    ordinaryHeadlessExecution: installed && standardCapabilities?.headless === true,
    nativeGoalController: "unsupported",
    goalCapabilities: Object.freeze(Object.fromEntries(
      GOAL_CONTROLS.map((name) => [name, capabilityState])
    )),
    nativeOvernightReady: false,
    managedOvernightReady: false,
    reason: !installed ? "PROVIDER_NOT_INSTALLED" :
      !version ? "PROVIDER_VERSION_UNVERIFIED" : "GOAL_LIFECYCLE_NOT_CERTIFIED"
  });
}

function selectGoalExecution(preflight, {
  requestedOwner = "native-provider", autonomousExecution = false,
  approvedFallback = false
} = {}) {
  if (!["native-provider", "maestro-managed"].includes(requestedOwner)) {
    throw new TypeError("invalid Goal execution owner");
  }
  if (!preflight || preflight.schemaVersion !== 1) {
    throw new TypeError("versioned Goal preflight required");
  }
  // No automatic correction, approved bounded policy, or native lifecycle is
  // certified yet. An explicit fallback is NEVER an authorization to dispatch.
  const reason = !autonomousExecution ? "GOAL_AUTONOMY_DISABLED" :
    !preflight.installed ? "PROVIDER_NOT_INSTALLED" :
      requestedOwner === "native-provider" && !approvedFallback ?
        "NATIVE_GOAL_UNSUPPORTED" : "MANAGED_GOAL_LOOP_NOT_CERTIFIED";
  return Object.freeze({
    schemaVersion: 1,
    status: "BLOCKED_NEEDS_USER",
    requestedOwner, selectedOwner: null,
    approvedFallback: approvedFallback === true,
    dispatchAllowed: false,
    reason
  });
}

module.exports = { GOAL_CONTROLS, NATIVE_GOAL_GUIDANCE, observesNativeGoalCommand, inspectProviderGoal, selectGoalExecution };
