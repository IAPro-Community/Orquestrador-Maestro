#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const STATE_SCHEMA_VERSION = 1;
const STATE_FILENAME = "install-state.json";

function getDefaultState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    targets: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function validateState(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) return false;
  if (!parsed.targets || typeof parsed.targets !== "object" || Array.isArray(parsed.targets)) return false;
  for (const [, target] of Object.entries(parsed.targets)) {
    if (!target || typeof target !== "object" || Array.isArray(target)) return false;
    if ("enabled" in target && typeof target.enabled !== "boolean") return false;
    if ("managedFiles" in target) {
      if (!Array.isArray(target.managedFiles)) return false;
      if (!target.managedFiles.every(item => typeof item === "string" && item.length > 0)) return false;
    }
    if ("managedDirectories" in target) {
      if (!Array.isArray(target.managedDirectories)) return false;
      if (!target.managedDirectories.every(item => typeof item === "string" && item.length > 0)) return false;
    }
  }
  return true;
}

function getStatePath(orquestradorDir) {
  return path.join(orquestradorDir, STATE_FILENAME);
}

function readState(orquestradorDir) {
  const statePath = getStatePath(orquestradorDir);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const stat = fs.lstatSync(statePath);
    if (stat.isSymbolicLink()) return null;
  } catch {
    return null;
  }
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!validateState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeState(orquestradorDir, state) {
  const statePath = getStatePath(orquestradorDir);
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  try {
    const stat = fs.lstatSync(statePath);
    if (stat.isSymbolicLink()) {
      throw new Error("Refusing to write install-state: path is a symlink");
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      // file does not exist yet, safe to proceed
    } else {
      throw err;
    }
  }

  if (fs.existsSync(statePath)) {
    try {
      const existingContent = fs.readFileSync(statePath, "utf8");
      try {
        const parsed = JSON.parse(existingContent);
        if (!validateState(parsed)) {
          const backupPath = statePath + ".corrupt." + Date.now();
          fs.copyFileSync(statePath, backupPath);
        }
      } catch {
        const backupPath = statePath + ".corrupt." + Date.now();
        fs.copyFileSync(statePath, backupPath);
      }
    } catch {}
  }

  const payload = {
    ...state,
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString()
  };

  if (!validateState(payload)) {
    throw new Error("Refusing to write invalid state");
  }

  const content = JSON.stringify(payload, null, 2) + "\n";

  const tmpPath = statePath + ".tmp." + process.pid;
  try {
    fs.writeFileSync(tmpPath, content, { mode: 0o600 });
    fs.renameSync(tmpPath, statePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

function getTargetState(state, toolId) {
  if (!state || !state.targets) return null;
  return state.targets[toolId] || null;
}

function isTargetEnabled(state, toolId) {
  const target = getTargetState(state, toolId);
  return Boolean(target && target.enabled === true);
}

function enableTarget(state, toolId, selection, detectionState) {
  if (!state) state = getDefaultState();
  if (!state.targets) state.targets = {};
  state.targets[toolId] = {
    enabled: true,
    selection: selection || "user",
    lastDetection: detectionState || "detected",
    enabledAt: new Date().toISOString()
  };
  return state;
}

function disableTarget(state, toolId) {
  if (!state || !state.targets) return state;
  if (state.targets[toolId]) {
    state.targets[toolId].enabled = false;
    state.targets[toolId].disabledAt = new Date().toISOString();
  }
  return state;
}

function getEnabledTargets(state) {
  if (!state || !state.targets) return [];
  return Object.entries(state.targets)
    .filter(([, t]) => t.enabled === true)
    .map(([id]) => id);
}

function updateDetectionState(state, toolId, detectionResult) {
  if (!state) state = getDefaultState();
  if (!state.targets) state.targets = {};
  if (!state.targets[toolId]) {
    state.targets[toolId] = {
      enabled: false,
      selection: "none",
      lastDetection: detectionResult.state
    };
  } else {
    state.targets[toolId].lastDetection = detectionResult.state;
  }
  return state;
}

module.exports = {
  STATE_SCHEMA_VERSION,
  STATE_FILENAME,
  getDefaultState,
  getStatePath,
  validateState,
  readState,
  writeState,
  getTargetState,
  isTargetEnabled,
  enableTarget,
  disableTarget,
  getEnabledTargets,
  updateDetectionState
};
