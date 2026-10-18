"use strict";

// Fail-closed helper for sandbox requests an adapter cannot honour.
//
// Before this existed, adapters silently DROPPED an unrecognised sandbox
// request: `agy` accepted only `true`/"enabled" and ignored "read-only", so a
// caller asking for a read-only run got full write access with no error. A
// sandbox that is requested but cannot be applied must fail loudly rather than
// downgrade silently — otherwise the security promise is false.

const EXPLICIT_SANDBOX_VALUES = Object.freeze([
  "read-only",
  "read-only-fs",
  "workspace-write",
  "danger-full-access",
  true,
  "enabled"
]);

function isExplicitSandboxRequest(sandbox) {
  if (sandbox === undefined || sandbox === null || sandbox === false) return false;
  if (typeof sandbox === "string") return sandbox.trim() !== "";
  return EXPLICIT_SANDBOX_VALUES.includes(sandbox);
}

/**
 * @param {object} params
 * @param {unknown} params.requested  the sandbox value from the request
 * @param {string}  params.providerId
 * @param {boolean} params.supported  whether this adapter can apply sandboxing at all
 * @param {boolean} [params.honoursReadOnly] adapter applies a read-only sandbox faithfully
 * @throws {Error} when a sandbox was explicitly requested and cannot be honoured
 */
function assertSandboxHonourable({ requested, providerId, supported, honoursReadOnly = true }) {
  if (!isExplicitSandboxRequest(requested)) return;
  if (requested === true || requested === "enabled") {
    // Generic "give me a sandbox" request: adapters that support sandboxing may
    // apply their own default mode.
    if (!supported) {
      throw new Error(
        `provider ${providerId} does not support sandboxing; refusing to run with sandbox=true`
      );
    }
    return;
  }
  if (!supported) {
    throw new Error(
      `provider ${providerId} does not support sandboxing; refusing requested sandbox "${requested}"`
    );
  }
  if (!honoursReadOnly && (requested === "read-only" || requested === "read-only-fs")) {
    throw new Error(
      `provider ${providerId} cannot enforce a read-only sandbox; refusing requested sandbox "${requested}"`
    );
  }
}

module.exports = { assertSandboxHonourable, isExplicitSandboxRequest, EXPLICIT_SANDBOX_VALUES };