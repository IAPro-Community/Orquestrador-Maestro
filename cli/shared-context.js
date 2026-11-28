"use strict";

// Shared CLI context: single place for rootDir, requires and arg helpers.
// Extracted from bin/orquestrador-maestro.js with zero behavior change.

const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const packageJson = require(path.join(rootDir, "package.json"));
const managedFiles = require(path.join(rootDir, "scripts", "managed-files.js"));
const updateMigrations = require(path.join(rootDir, "scripts", "update-migrations.js"));
const nativeSkillsSync = require(path.join(rootDir, "orquestrador", "bin", "sync-managed-skill.js"));
const contextBrief = require(path.join(rootDir, "orquestrador", "bin", "context-brief.js"));
const workflowLock = require(path.join(rootDir, "orquestrador", "bin", "workflow-lock.js"));
const { resolveGitContext } = require(path.join(rootDir, "orquestrador", "lib", "git-context.js"));
const workflowState = require(path.join(rootDir, "orquestrador", "bin", "workflow-state.js"));
const { Memory } = require(path.join(rootDir, "orquestrador", "bin", "memory.js"));
const { MaestroApplication } = require(path.join(rootDir, "runtime", "application"));
const { createBridge, createStdioServer } = require(path.join(rootDir, "runtime", "bridge"));
const { resolveMaestroRoot } = require(path.join(rootDir, "runtime", "config", "maestro-paths"));
const { loadGovernanceConfig, writeGovernanceConfig } = require(path.join(rootDir, "runtime", "governance", "compatibility"));
const { loadInteractionCatalog, resolveInteractionProfile, setInteractionProfile, resetInteractionProfile } = require(path.join(rootDir, "runtime", "interaction"));
const { formatStatus, resolveStatus } = require(path.join(rootDir, "runtime", "status"));
const { listSupportedTools, getToolDefinition, isSupportedTool } = require(path.join(rootDir, "orquestrador", "lib", "tool-registry.js"));
const { DETECTION_STATES, detectAllTools, detectToolById } = require(path.join(rootDir, "orquestrador", "lib", "tool-detector.js"));
const installState = require(path.join(rootDir, "orquestrador", "lib", "install-state.js"));
const { getNpmChannel } = require(path.join(rootDir, "orquestrador", "lib", "npm-version"));

const telemetryTimeoutMs = 350;
const telemetryConsentVersion = 2;
const defaultTelemetryProvider = "posthog";
const defaultTelemetryEndpointUrl = "";

const installFlagDefs = {
  "--home-path": { ps: "-HomePath", sh: "--home-path", value: true },
  "--no-force": { ps: "-NoForce", sh: "--no-force" },
  "--no-tool-profiles": { ps: "-NoToolProfiles", sh: "--no-tool-profiles" },
  "--core-only": { ps: "-CoreOnly", sh: "--core-only" },
  "--skip-community-skills": { ps: "-SkipCommunitySkills", sh: "--skip-community-skills" },
  "--skip-skill-sync": { ps: "-SkipSkillSync", sh: "--skip-skill-sync" },
  "--only": { ps: "-Only", sh: "--only", value: true, splitComma: true },
  "--dry-run": { ps: "-DryRun", sh: "--dry-run" },
  "--list-targets": { ps: "-ListTargets", sh: "--list-targets" },
  "--uninstall": { ps: "-Uninstall", sh: "--uninstall" },
  "--non-interactive": { ps: "-NonInteractive", sh: "--non-interactive" },
  "--verbose-paths": { ps: "-VerbosePaths", sh: "--verbose-paths" },
  "--all-targets": { ps: "-AllTargets", sh: "--all-targets" }
};

const verifyFlagDefs = {
  "--home-path": { ps: "-HomePath", sh: "--home-path", value: true },
  "--skip-tool-profiles": { ps: "-SkipToolProfiles", sh: "--skip-tool-profiles" },
  "--core-only": { ps: "-CoreOnly", sh: "--core-only" },
  "--strict": { ps: "-Strict", sh: "--strict" },
  "--verbose-paths": { ps: "-VerbosePaths", sh: "--verbose-paths" }
};

const initDevFlagDefs = {
  "--project-path": { ps: "-ProjectPath", sh: "--project-path", value: true }
};

function parseArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) return null;
  return val;
}

function parseArgEqual(args, name) {
  const prefix = `${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

function commandExists(filePath) {
  return fs.existsSync(filePath);
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpm(args, options = {}) {
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec || "cmd.exe", [
      "/d", "/s", "/c", getNpmCommand(), ...args
    ], { ...options, shell: false });
  }

  return spawnSync(getNpmCommand(), args, { ...options, shell: false });
}

function getPublishedNpmVersion() {
  const { getPublishedNpmVersion: resolvePublishedNpmVersion } = require("../orquestrador/lib/npm-version");
  return resolvePublishedNpmVersion({ name: packageJson.name, version: packageJson.version, runNpm });
}

function compareVersions(left, right) {
  const parse = (version) => {
    const [core, prerelease] = version.split("-", 2);
    return {
      core: core.split(".").map(Number),
      prerelease: prerelease ? prerelease.split(".") : []
    };
  };
  const leftParsed = parse(left);
  const rightParsed = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParsed.core[index] !== rightParsed.core[index]) {
      return leftParsed.core[index] > rightParsed.core[index] ? 1 : -1;
    }
  }

  if (leftParsed.prerelease.length === 0 && rightParsed.prerelease.length > 0) return 1;
  if (leftParsed.prerelease.length > 0 && rightParsed.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(leftParsed.prerelease.length, rightParsed.prerelease.length); index += 1) {
    const leftPart = leftParsed.prerelease[index];
    const rightPart = rightParsed.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumber = /^\d+$/u.test(leftPart);
    const rightNumber = /^\d+$/u.test(rightPart);
    if (leftNumber && rightNumber) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function hasV3SkillManifest(maestroRoot) {
  const manifestPath = path.join(maestroRoot, "SKILLS_MANIFEST.json");
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return manifest.version === 3;
  } catch {
    return false;
  }
}

function getArg(args, name) {
  return parseArg(args, name) || parseArgEqual(args, name);
}

function extractPositionalArg(args, knownFlags) {
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (!a.startsWith("-")) {
      const prev = i > 0 ? args[i - 1] : null;
      if (prev && knownFlags.includes(prev)) continue;
      return a;
    }
  }
  return null;
}

function resolveBenchmarkScenario(value) {
  if (!value || value.includes(path.sep) || value.includes("/") || value.endsWith(".json") || value.includes("..")) return value;
  return path.join(rootDir, "benchmark-harness", "scenarios", `${value}.json`);
}

function normalizeArgs(args) {
  return args.flatMap((arg) => {
    if (arg.startsWith("--") && arg.includes("=")) {
      const index = arg.indexOf("=");
      return [arg.slice(0, index), arg.slice(index + 1)];
    }
    return [arg];
  });
}

function parseRuntimeArgs(args, allowed = [], booleanFlags = []) {
  const normalized = normalizeArgs(args);
  const options = { projectPath: process.cwd(), values: [] };
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (!arg.startsWith("--")) { options.values.push(arg); continue; }
    if (!allowed.includes(arg) && !booleanFlags.includes(arg)) throw new Error(`Parametro desconhecido: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (booleanFlags.includes(arg)) {
      options[key] = true;
      continue;
    }
    const value = normalized[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Parametro ${arg} exige um valor.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

async function createRuntimeApplication(projectPath) {
  const app = new MaestroApplication({ projectRoot: projectPath });
  await app.initialize();
  const { AttentionQueue } = require(path.join(rootDir, "runtime", "attention", "attention-queue"));
  const { AttentionProducers } = require(path.join(rootDir, "runtime", "attention", "attention-producers"));
  const { TaskGraphPersistence } = require(path.join(rootDir, "runtime", "planner", "task-graph-persistence"));
  const project = await app.inspectProject({ projectPath: app.projectRoot });
  app.attention = new AttentionQueue({ store: app.store, record: (type, data) => app.record(null, type, data) });
  app.attentionProducers = new AttentionProducers({ queue: app.attention, projectId: project.id });
  app.taskGraphs = new TaskGraphPersistence({ store: app.store });
  return app;
}

module.exports = {
  path,
  rootDir,
  packageJson,
  managedFiles,
  updateMigrations,
  nativeSkillsSync,
  contextBrief,
  workflowLock,
  resolveGitContext,
  workflowState,
  Memory,
  MaestroApplication,
  createBridge,
  createStdioServer,
  resolveMaestroRoot,
  loadGovernanceConfig,
  writeGovernanceConfig,
  loadInteractionCatalog,
  resolveInteractionProfile,
  setInteractionProfile,
  resetInteractionProfile,
  formatStatus,
  resolveStatus,
  listSupportedTools,
  getToolDefinition,
  isSupportedTool,
  DETECTION_STATES,
  detectAllTools,
  detectToolById,
  installState,
  telemetryTimeoutMs,
  telemetryConsentVersion,
  defaultTelemetryProvider,
  defaultTelemetryEndpointUrl,
  installFlagDefs,
  verifyFlagDefs,
  initDevFlagDefs,
  normalizeArgs,
  parseArg,
  parseArgEqual,
  getArg,
  extractPositionalArg,
  resolveBenchmarkScenario,
  parseRuntimeArgs,
  createRuntimeApplication,
  commandExists,
  getNpmCommand,
  runNpm,
  getPublishedNpmVersion,
  compareVersions,
  hasV3SkillManifest,
  getNpmChannel
};
