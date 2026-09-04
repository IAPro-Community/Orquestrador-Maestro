#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { TOOL_DEFINITIONS, isSupportedTool, resolveToolConfigPaths } = require("./tool-registry.js");

const DETECTION_STATES = {
  DETECTED: "detected",
  CONFIGURED: "configured",
  NOT_DETECTED: "not-detected"
};

function executableExists(command) {
  if (!command) return false;
  try {
    const result = spawnSync(command, ["--version"], {
      stdio: "ignore",
      shell: process.platform === "win32",
      timeout: 3000
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function configPathExists(toolId, homePath) {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def) return false;
  const configPaths = resolveToolConfigPaths(toolId, homePath);
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      return { exists: true, path: configPath };
    }
  }
  return { exists: false, path: null };
}

function hasMaestroMarker(homePath, toolId) {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def) return false;
  const configPaths = resolveToolConfigPaths(toolId, homePath);
  for (const configPath of configPaths) {
    if (!fs.existsSync(configPath)) continue;
    const markerPath = path.join(configPath, ".maestro-managed");
    if (fs.existsSync(markerPath)) {
      return true;
    }
  }
  return false;
}

function detectTool(toolId, homePath) {
  if (!isSupportedTool(toolId)) {
    return { toolId, state: DETECTION_STATES.NOT_DETECTED, reason: "unsupported-tool" };
  }

  const def = TOOL_DEFINITIONS[toolId];

  for (const command of def.commands) {
    if (executableExists(command)) {
      return {
        toolId,
        state: DETECTION_STATES.DETECTED,
        reason: "executable-found",
        command
      };
    }
  }

  const config = configPathExists(toolId, homePath);
  if (config.exists) {
    if (hasMaestroMarker(homePath, toolId)) {
      return {
        toolId,
        state: DETECTION_STATES.NOT_DETECTED,
        reason: "maestro-created-directory-only"
      };
    }
    return {
      toolId,
      state: DETECTION_STATES.CONFIGURED,
      reason: "config-directory-found",
      configPath: config.path
    };
  }

  return {
    toolId,
    state: DETECTION_STATES.NOT_DETECTED,
    reason: "nothing-found"
  };
}

function detectAllTools(homePath) {
  const results = {};
  for (const toolId of Object.keys(TOOL_DEFINITIONS)) {
    results[toolId] = detectTool(toolId, homePath);
  }
  return results;
}

function detectToolById(toolId, homePath) {
  if (!isSupportedTool(toolId)) {
    return { toolId, state: DETECTION_STATES.NOT_DETECTED, reason: "unsupported-tool" };
  }
  return detectTool(toolId, homePath);
}

module.exports = {
  DETECTION_STATES,
  detectTool,
  detectAllTools,
  detectToolById,
  executableExists,
  configPathExists,
  hasMaestroMarker
};
