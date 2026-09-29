"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { sessionKey } = require("./session-state");

function stablePolicyShape({ mode, complexity, profile, selectedSkills, allowSubagents } = {}) {
  return {
    mode: String(mode || "optimize"),
    complexity: String(complexity || "STANDARD"),
    profile: String(profile || "standard"),
    contextBudget: Number.isFinite(Number(arguments[0]?.contextBudget)) ? Number(arguments[0].contextBudget) : null,
    selectedSkills: [...new Set((selectedSkills || []).filter(Boolean))].sort(),
    allowSubagents: Boolean(allowSubagents)
  };
}

function computePolicyDigest(policy) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stablePolicyShape(policy)), "utf8")
    .digest("hex")
    .slice(0, 24);
}

function ledgerPath(pluginData, sessionId) {
  if (!pluginData || !sessionId) return null;
  return path.join(pluginData, "ledger", sessionKey(sessionId) + ".json");
}

function readLedger(pluginData, sessionId) {
  const file = ledgerPath(pluginData, sessionId);
  if (!file || !fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLedger(pluginData, sessionId, ledger) {
  const file = ledgerPath(pluginData, sessionId);
  if (!file) return ledger;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  fs.renameSync(temp, file);
  return ledger;
}

function updateLedger(pluginData, sessionId, patchOrUpdater) {
  if (!sessionId) return null;
  const current = readLedger(pluginData, sessionId) || {
    version: 1,
    sessionId,
    createdAt: new Date().toISOString(),
    counters: {}
  };
  const patch = typeof patchOrUpdater === "function" ? patchOrUpdater(current) : patchOrUpdater;
  const next = {
    ...current,
    ...(patch || {}),
    counters: { ...(current.counters || {}), ...((patch || {}).counters || {}) },
    updatedAt: new Date().toISOString()
  };
  return writeLedger(pluginData, sessionId, next);
}

function incrementCounter(ledger, name, amount = 1) {
  const counters = { ...(ledger?.counters || {}) };
  counters[name] = (Number(counters[name]) || 0) + amount;
  return counters;
}

function recordRoute(pluginData, sessionId, data = {}) {
  const policy = stablePolicyShape(data);
  const digest = computePolicyDigest(policy);
  const current = readLedger(pluginData, sessionId) || {};
  const repeated = current.lastPolicyDigest === digest;
  const next = updateLedger(pluginData, sessionId, {
    cwd: data.cwd || current.cwd || null,
    turnId: data.turnId || null,
    promptDigest: data.prompt
      ? crypto.createHash("sha256").update(String(data.prompt), "utf8").digest("hex").slice(0, 24)
      : current.promptDigest || null,
    policy,
    lastPolicyDigest: digest,
    lastPolicyRepeated: repeated,
    selectedSkills: policy.selectedSkills,
    complexity: policy.complexity,
    profile: policy.profile,
    allowSubagents: policy.allowSubagents,
    counters: incrementCounter(current, "routedTurns")
  });
  return { ledger: next, digest, repeated };
}

function recordPolicyInjection(pluginData, sessionId, { injected, approximateTokens = 0 } = {}) {
  return updateLedger(pluginData, sessionId, (current) => {
    let counters = incrementCounter(current, injected ? "policyInjections" : "policySkips");
    if (injected) {
      counters = {
        ...counters,
        injectedTokensApprox: (Number(counters.injectedTokensApprox) || 0) + Number(approximateTokens || 0)
      };
    }
    return { counters };
  });
}

function recordToolDecision(pluginData, sessionId, decision = {}) {
  return updateLedger(pluginData, sessionId, (current) => {
    let counters = incrementCounter(current, "toolCalls");
    if (decision.action === "deny") counters = { ...counters, toolDenied: (Number(counters.toolDenied) || 0) + 1 };
    if (decision.action === "context") counters = { ...counters, toolWarnings: (Number(counters.toolWarnings) || 0) + 1 };
    if (decision.action === "rewrite") counters = { ...counters, toolRewrites: (Number(counters.toolRewrites) || 0) + 1 };
    return {
      counters,
      lastToolDecision: {
        action: decision.action || "allow",
        toolName: decision.toolName || null,
        reason: decision.reason || null,
        at: new Date().toISOString()
      }
    };
  });
}

function recordCompaction(pluginData, sessionId, capsule) {
  return updateLedger(pluginData, sessionId, (current) => ({
    compactionCapsule: capsule || null,
    counters: incrementCounter(current, "compactions")
  }));
}

function closeLedger(pluginData, sessionId) {
  return updateLedger(pluginData, sessionId, { endedAt: new Date().toISOString() });
}

function ledgerStats(pluginData, sessionId) {
  const ledger = readLedger(pluginData, sessionId);
  if (!ledger) return null;
  return {
    sessionId: ledger.sessionId || sessionId,
    complexity: ledger.complexity || null,
    profile: ledger.profile || null,
    selectedSkills: ledger.selectedSkills || [],
    lastPolicyDigest: ledger.lastPolicyDigest || null,
    counters: ledger.counters || {},
    updatedAt: ledger.updatedAt || null,
    endedAt: ledger.endedAt || null
  };
}

module.exports = {
  closeLedger,
  computePolicyDigest,
  ledgerPath,
  ledgerStats,
  readLedger,
  recordCompaction,
  recordPolicyInjection,
  recordRoute,
  recordToolDecision,
  stablePolicyShape,
  updateLedger,
  writeLedger
};
