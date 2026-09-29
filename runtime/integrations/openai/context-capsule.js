"use strict";

const { approximateTokens, trimToBudget } = require("./context-budget");

const DEFAULT_CAPSULE_TOKENS = 180;

function buildCompactionCapsule(ledger = {}, maxTokens = DEFAULT_CAPSULE_TOKENS) {
  const skills = (ledger.selectedSkills || []).filter(Boolean);
  const counters = ledger.counters || {};
  const lines = [
    "Maestro context capsule:",
    `- complexity=${ledger.complexity || "STANDARD"}; profile=${ledger.profile || "standard"}; subagents=${ledger.allowSubagents ? "allowed" : "not-authorized"}.`,
    `- skills=${skills.length ? skills.join(",") : "none"}.`,
    `- routedTurns=${Number(counters.routedTurns) || 0}; toolCalls=${Number(counters.toolCalls) || 0}; injected≈${Number(counters.injectedTokensApprox) || 0} tokens.`,
    "- Resume with progressive disclosure; do not reload broad repository context unless the task requires it."
  ];
  const text = trimToBudget(lines.join("\n"), maxTokens);
  return Object.freeze({
    version: 1,
    text,
    approximateTokens: approximateTokens(text),
    policyDigest: ledger.lastPolicyDigest || null,
    createdAt: new Date().toISOString()
  });
}

module.exports = { DEFAULT_CAPSULE_TOKENS, buildCompactionCapsule };
