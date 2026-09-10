"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CANONICAL_DIR_NAME = ".orquestrador-maestro";
const LEGACY_DIR_NAME = ".orquestrador";

function existingDirectory(candidates) {
  return candidates.find((candidate) => {
    try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
  });
}

function resolveMaestroRoot({ home = os.homedir(), prefer = "existing" } = {}) {
  const canonical = path.resolve(home, CANONICAL_DIR_NAME);
  const legacy = path.resolve(home, LEGACY_DIR_NAME);
  if (prefer === "canonical") return canonical;
  return existingDirectory([canonical, legacy]) || canonical;
}

function resolveProjectMaestroRoot(projectRoot, { prefer = "existing" } = {}) {
  const root = path.resolve(projectRoot);
  const canonical = path.join(root, CANONICAL_DIR_NAME);
  const legacy = path.join(root, LEGACY_DIR_NAME);
  if (prefer === "canonical") return canonical;
  const runtime = existingDirectory([path.join(canonical, "runtime"), path.join(legacy, "runtime")]);
  return runtime ? path.dirname(runtime) : existingDirectory([canonical, legacy]) || canonical;
}

module.exports = {
  CANONICAL_DIR_NAME,
  LEGACY_DIR_NAME,
  resolveMaestroRoot,
  resolveProjectMaestroRoot
};
