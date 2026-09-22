"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { runtimePaths } = require("../bridge/socket-server");
const { resolveProjectMaestroRoot } = require("../config/maestro-paths");

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const OWNERSHIP_MAP = deepFreeze({
  topology: "per-project",
  invariant: "one canonical daemon writer per project store file",
  canonicalWriters: [
    { owner: "MaestroApplication", appMethods: ["registerProject", "createMission", "updateMission"], storeMethods: ["createProject", "saveMission"] },
    { owner: "MaestroApplication", appMethods: ["createRun", "executeRun"], storeMethods: ["saveTask", "saveRun", "saveStep", "saveExecution", "saveArtifact", "saveEvidence", "saveVerification"] },
    { owner: "MaestroApplication", appMethods: ["createTerminalSession", "startTerminal"], storeMethods: ["saveTerminal"] },
    { owner: "MaestroApplication", appMethods: ["record"], storeMethods: ["appendEvent"] },
    { owner: "MaestroApplication", appMethods: ["startIntentSession", "updateIntentSession", "approveMissionBrief"], storeMethods: ["saveIntentSession", "saveMissionBrief"] },
    { owner: "MaestroApplication", appMethods: ["persistProjectSnapshot", "persistTaskGraph", "saveAttention"], storeMethods: ["saveProjectSnapshot", "saveTaskGraph", "saveAttention"] }
  ],
  readOnlyConsumers: [
    "runtime/bridge/bridge.js",
    "runtime/bridge/socket-client.js",
    "runtime/bridge/stdio-server.js",
    "runtime/tui/*",
    "bin/orquestrador-maestro.js (read paths)",
    "runtime/git/monitor.js",
    "runtime/inspector/*"
  ],
  hotFiles: [
    "bin/orquestrador-maestro.js",
    "runtime/application/maestro-application.js",
    "runtime/tui/*",
    "runtime/planner/index.js",
    "runtime/providers/index.js",
    "runtime/terminals/index.js",
    "package.json"
  ]
});

function projectIdForRoot(projectRoot) {
  return `project-${crypto.createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16)}`;
}

function createProjectRuntimeOwnership(projectRoot, options = {}) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") throw new TypeError("projectRoot must be a non-empty string");
  const resolvedRoot = path.resolve(projectRoot);
  const paths = runtimePaths(resolvedRoot);
  const storeFile = path.resolve(options.storeFile || path.join(resolveProjectMaestroRoot(resolvedRoot), "runtime", "runs.json"));
  return deepFreeze({
    topology: "per-project",
    projectRoot: resolvedRoot,
    projectId: projectIdForRoot(resolvedRoot),
    socketPath: paths.socketPath,
    tokenPath: paths.tokenPath,
    storeFile,
    writerKey: storeFile,
    lockStrategy: "single-writer-daemon"
  });
}

class CanonicalWriterRegistry {
  constructor() { this._claims = new Map(); }

  claim(ownership, ownerId) {
    if (!ownership || ownership.topology !== "per-project") throw new TypeError("per-project ownership is required");
    if (typeof ownerId !== "string" || ownerId.trim() === "") throw new TypeError("ownerId must be a non-empty string");
    const key = path.resolve(ownership.writerKey);
    const current = this._claims.get(key);
    if (current) throw new Error(`Canonical writer already claimed for ${key} by ${current}`);
    this._claims.set(key, ownerId);
    let released = false;
    return () => {
      if (!released && this._claims.get(key) === ownerId) this._claims.delete(key);
      released = true;
    };
  }
}

module.exports = {
  OWNERSHIP_MAP,
  CanonicalWriterRegistry,
  createProjectRuntimeOwnership,
  projectIdForRoot
};
