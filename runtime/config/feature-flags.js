"use strict";

/**
 * Feature-flag registry for the engineering harness.
 *
 * Policy:
 * - Every flag is OFF by default. A missing flag, an unreadable config, an
 *   unknown flag or a non-boolean value all resolve to disabled.
 * - Enabling is explicit and per-project (`<project>/.orquestrador/config.json`
 *   → `features.<flag> = true`). No environment variable can silently enable a
 *   harness gate: env-based toggles are not part of this contract.
 * - Turning a flag back to `false` is the rollback path: resolution returns to
 *   the baseline behavior with no data to clean up, because no flag in this
 *   registry mutates stored records.
 */

const FLAG_REGISTRY = Object.freeze({
  "harness.specTraceability": Object.freeze({
    default: false,
    since: "1.3.0",
    description: "Emit a short, traceable spec: criterion → verifier → source → task."
  }),
  "harness.qualityProfiles": Object.freeze({
    default: false,
    since: "1.3.0",
    description: "Apply per-stack quality profiles (functional + a11y/responsive where applicable)."
  }),
  "harness.planPreview": Object.freeze({
    default: false,
    since: "1.3.0",
    description: "Expose read-only plan/evidence preview surfaces."
  })
});

const SAFE_KEY = /^[a-z][a-zA-Z0-9.-]{1,63}$/;

function isKnownFlag(name) {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(FLAG_REGISTRY, name);
}

/**
 * Strict validation for writes (CLI, config patch). Unknown or non-boolean
 * values are rejected here rather than being silently ignored.
 */
function validateFeatureFlags(input) {
  if (input === undefined) return Object.freeze({});
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("features must be an object of boolean flags");
  }
  const normalized = {};
  for (const [name, value] of Object.entries(input)) {
    if (!SAFE_KEY.test(name)) throw new TypeError(`feature flag name is not a safe key: ${name}`);
    if (!isKnownFlag(name)) throw new TypeError(`unknown feature flag: ${name}`);
    if (typeof value !== "boolean") throw new TypeError(`feature flag ${name} must be boolean`);
    normalized[name] = value;
  }
  return Object.freeze(normalized);
}

/**
 * Tolerant read path. Anything that cannot be proven enabled is disabled, and
 * every rejection is reported so `doctor`/`status` can surface it instead of
 * pretending the configuration was applied.
 */
function resolveFeatureFlags(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const flags = {};
  const ignored = [];
  for (const name of Object.keys(FLAG_REGISTRY)) flags[name] = false;
  for (const [name, value] of Object.entries(source)) {
    if (!isKnownFlag(name)) {
      ignored.push(Object.freeze({ flag: name, reason: "UNKNOWN_FLAG" }));
      continue;
    }
    if (typeof value !== "boolean") {
      ignored.push(Object.freeze({ flag: name, reason: "NON_BOOLEAN_VALUE" }));
      continue;
    }
    flags[name] = value;
  }
  const enabled = Object.keys(flags).filter((name) => flags[name]).sort();
  return Object.freeze({
    schemaVersion: 1,
    flags: Object.freeze(flags),
    enabled: Object.freeze(enabled),
    disabled: Object.freeze(Object.keys(flags).filter((name) => !flags[name]).sort()),
    ignored: Object.freeze(ignored),
    registry: Object.freeze(Object.keys(FLAG_REGISTRY).sort())
  });
}

function isEnabled(resolved, name) {
  if (!isKnownFlag(name)) return false;
  return Boolean(resolved && resolved.flags && resolved.flags[name] === true);
}

/**
 * Non-destructive rollback: returns the all-off resolution for the same
 * registry. Callers apply it instead of deleting configuration, so the
 * operator can re-enable with a single flag flip.
 */
function rollbackFeatureFlags() {
  return resolveFeatureFlags({});
}

module.exports = {
  FLAG_REGISTRY,
  isKnownFlag,
  validateFeatureFlags,
  resolveFeatureFlags,
  isEnabled,
  rollbackFeatureFlags
};