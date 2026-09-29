"use strict";

const fs = require("node:fs");
const path = require("node:path");

function statePath(pluginData) {
  if (!pluginData) return null;
  return path.join(pluginData, "maestro-session-state.json");
}

function loadState(pluginData) {
  const file = statePath(pluginData);
  if (!file || !fs.existsSync(file)) return { sessions: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && parsed.sessions ? parsed : { sessions: {} };
  } catch {
    return { sessions: {} };
  }
}

function saveState(pluginData, state) {
  const file = statePath(pluginData);
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.renameSync(temp, file);
}

function updateSession(pluginData, sessionId, patch) {
  if (!sessionId) return null;
  const state = loadState(pluginData);
  const current = state.sessions[sessionId] || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  state.sessions[sessionId] = next;
  saveState(pluginData, state);
  return next;
}

function getSession(pluginData, sessionId) {
  if (!sessionId) return null;
  return loadState(pluginData).sessions[sessionId] || null;
}

function endSession(pluginData, sessionId) {
  if (!sessionId) return;
  const state = loadState(pluginData);
  if (state.sessions[sessionId]) {
    state.sessions[sessionId] = { ...state.sessions[sessionId], endedAt: new Date().toISOString() };
    saveState(pluginData, state);
  }
}

module.exports = { endSession, getSession, loadState, saveState, statePath, updateSession };
