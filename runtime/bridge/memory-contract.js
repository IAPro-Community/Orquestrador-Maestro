"use strict";

/**
 * Canonical memory surface of Bridge protocol v1.
 *
 * This module is the single source of truth for what the Bridge may expose
 * about canonical Maestro memory. `createBridge` validates its own method
 * table against it at construction time, and `scripts/check-memory-contract.js`
 * validates the published documentation against it. Adding a memory method
 * without updating both therefore fails loudly instead of drifting.
 *
 * Deliberate omissions:
 * - `memory.promote`: promotion is a CLI operation gated by verified evidence
 *   (`orquestrador/bin/memory.js`), never a model-callable Bridge method.
 * - `memory.delete`/`memory.update`: canonical memory is append-only through
 *   the guarded writer; no CRUD surface exists.
 */

const MEMORY_CONTRACT = Object.freeze({
  version: 1,
  capabilities: Object.freeze({ read: true, scoped: true }),
  methods: Object.freeze({
    "memory.search": Object.freeze({
      readOnly: true,
      requiresWriteCapability: false,
      params: Object.freeze(["search", "type", "verified", "rank", "taskId", "offset", "limit", "projectPath"])
    }),
    "memory.get": Object.freeze({
      readOnly: true,
      requiresWriteCapability: false,
      params: Object.freeze(["id", "taskId", "projectPath"])
    }),
    "memory.timeline": Object.freeze({
      readOnly: true,
      requiresWriteCapability: false,
      params: Object.freeze(["search", "type", "verified", "rank", "taskId", "offset", "limit", "projectPath"])
    }),
    "memory.record": Object.freeze({
      readOnly: false,
      requiresWriteCapability: true,
      params: Object.freeze([
        "confirmed", "reason", "idempotencyKey", "type", "summary", "details",
        "scopeLevel", "taskId", "tags", "files", "projectPath"
      ])
    })
  }),
  // Parameters the Maestro derives itself. A client that sends one is rejected,
  // so scope can never be forged over the wire.
  derivedParams: Object.freeze([
    "repositoryId", "branch", "workspaceId", "headCommit", "scope", "allowAncestry", "baseDir"
  ]),
  forbiddenMethods: Object.freeze(["memory.promote", "memory.delete", "memory.update", "memory.forget"])
});

/**
 * Canonical `initialize.capabilities.memory` projection.
 * Write is advertised only when the operator opted in at process start.
 */
function memoryCapabilities({ writeEnabled = false } = {}) {
  if (typeof writeEnabled !== "boolean") throw new TypeError("writeEnabled must be boolean");
  return Object.freeze({
    version: MEMORY_CONTRACT.version,
    read: MEMORY_CONTRACT.capabilities.read,
    write: writeEnabled === true,
    scoped: MEMORY_CONTRACT.capabilities.scoped
  });
}

/**
 * Fails when the Bridge method table drifts from the declared contract.
 * Returns the observed memory methods for evidence.
 */
function validateMemorySurface(methods) {
  if (!methods || typeof methods !== "object") throw new TypeError("bridge methods table is required");
  const declared = Object.keys(MEMORY_CONTRACT.methods).sort();
  const observed = Object.keys(methods).filter((name) => name.startsWith("memory.")).sort();
  const missing = declared.filter((name) => !observed.includes(name));
  const undeclared = observed.filter((name) => !declared.includes(name));
  if (missing.length || undeclared.length) {
    throw new TypeError(
      `Bridge memory surface drifted from the canonical contract (missing: ${missing.join(", ") || "none"}; ` +
      `undeclared: ${undeclared.join(", ") || "none"})`
    );
  }
  const forbidden = MEMORY_CONTRACT.forbiddenMethods.filter((name) => Object.prototype.hasOwnProperty.call(methods, name));
  if (forbidden.length) {
    throw new TypeError(`forbidden memory methods exposed: ${forbidden.join(", ")}`);
  }
  return Object.freeze({ methods: Object.freeze(observed), version: MEMORY_CONTRACT.version });
}

module.exports = { MEMORY_CONTRACT, memoryCapabilities, validateMemorySurface };