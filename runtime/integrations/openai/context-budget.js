"use strict";

const INJECTION_BUDGETS = Object.freeze({
  MICRO: 100,
  SIMPLE: 140,
  STANDARD: 200,
  COMPLEX: 300,
  DEEP: 450
});

function injectionBudget(level) {
  return INJECTION_BUDGETS[String(level || "STANDARD").toUpperCase()] || INJECTION_BUDGETS.STANDARD;
}

function approximateTokens(value) {
  return Math.ceil(Buffer.byteLength(String(value || ""), "utf8") / 4);
}

function trimToBudget(value, maxTokens) {
  const text = String(value || "").trim();
  if (!text) return "";
  const maxChars = Math.max(64, Number(maxTokens || 0) * 4);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 16)).trimEnd() + " …[trimmed]";
}

module.exports = { INJECTION_BUDGETS, approximateTokens, injectionBudget, trimToBudget };
