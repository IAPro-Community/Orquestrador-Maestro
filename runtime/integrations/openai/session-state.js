"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sessionKey(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId || ""), "utf8").digest("hex").slice(0, 32);
}

function statePath(pluginData, sessionId) {
  if (!pluginData || !sessionId) return null;
  return path.join(pluginData, "sessions", sessionKey(sessionId) + ".json");
}

function getSession(pluginData, sessionId) {
  const file = statePath(pluginData, sessionId);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(pluginData, sessionId, state) {
  const file = statePath(pluginData, sessionId);
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.renameSync(temp, file);
}

function updateSession(pluginData, sessionId, patch) {
  if (!sessionId) return null;
  const current = getSession(pluginData, sessionId) || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  saveSession(pluginData, sessionId, next);
  return next;
}

function endSession(pluginData, sessionId) {
  if (!sessionId) return;
  const current = getSession(pluginData, sessionId);
  if (current) saveSession(pluginData, sessionId, { ...current, endedAt: new Date().toISOString() });
}

module.exports = { endSession, getSession, saveSession, sessionKey, statePath, updateSession };
