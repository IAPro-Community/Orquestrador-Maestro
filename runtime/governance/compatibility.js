"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { CANONICAL_DIR_NAME, LEGACY_DIR_NAME } = require("../config/maestro-paths");

const DEFAULT_CONFIG = Object.freeze({
  mode: "compatibility",
  tone: "preserved",
  warningFrequency: "once-per-session",
  checks: { missingVerification: "warn", missingEvidence: "recommend" },
  hooks: { enabled: false },
  scope: "project",
  providerModel: "informational"
});

function mergeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const mode = source.mode === "strict" ? "strict" : "compatibility";
  const tone = source.tone === "preserved" ? "preserved" : DEFAULT_CONFIG.tone;
  const warningFrequency = ["once-per-session", "always", "never"].includes(source.warningFrequency)
    ? source.warningFrequency : DEFAULT_CONFIG.warningFrequency;
  const checks = source.checks && typeof source.checks === "object" ? source.checks : {};
  const hooks = source.hooks && typeof source.hooks === "object" ? source.hooks : {};
  return Object.freeze({
    ...DEFAULT_CONFIG, ...source,
    mode, tone, warningFrequency,
    checks: Object.freeze({
      ...DEFAULT_CONFIG.checks,
      missingVerification: ["off", "warn", "block"].includes(checks.missingVerification)
        ? checks.missingVerification : DEFAULT_CONFIG.checks.missingVerification,
      missingEvidence: ["off", "recommend", "block"].includes(checks.missingEvidence)
        ? checks.missingEvidence : DEFAULT_CONFIG.checks.missingEvidence
    }),
    hooks: Object.freeze({ enabled: hooks.enabled === true })
  });
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function loadGovernanceConfig({ cwd = process.cwd(), home = process.env.HOME || process.env.USERPROFILE } = {}) {
  const candidates = [
    path.join(cwd, CANONICAL_DIR_NAME, "config.json"),
    path.join(cwd, LEGACY_DIR_NAME, "maestro-config.json"),
    home ? path.join(home, CANONICAL_DIR_NAME, "config.json") : null,
    home ? path.join(home, LEGACY_DIR_NAME, "maestro-config.json") : null
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return { config: mergeConfig(found ? readJson(found) : undefined), source: found || "default" };
}

function writeGovernanceConfig({ cwd = process.cwd(), patch = {} } = {}) {
  const directory = path.join(path.resolve(cwd), CANONICAL_DIR_NAME);
  const filePath = path.join(directory, "config.json");
  const current = loadGovernanceConfig({ cwd }).config;
  const next = mergeConfig({ ...current, ...patch, checks: { ...current.checks, ...(patch.checks || {}) }, hooks: { ...current.hooks, ...(patch.hooks || {}) } });
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, filePath);
  } finally {
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* Best effort cleanup. */ }
  }
  return { config: next, path: filePath };
}

function buildGovernance({ config, task = {}, verification, evidence = [], sessionWarnings = new Set() } = {}) {
  const current = mergeConfig(config);
  const warnings = [];
  const recommendations = [];
  const blocking = [];
  const canEmit = (key) => current.warningFrequency === "always"
    || (current.warningFrequency === "once-per-session" && !sessionWarnings.has(key));
  const addWarning = (key, item) => {
    if (current.warningFrequency === "never" || !canEmit(key)) return;
    sessionWarnings.add(key); warnings.push(item);
  };
  const addRecommendation = (key, item) => {
    if (current.warningFrequency === "never" || !canEmit(key)) return;
    sessionWarnings.add(key); recommendations.push(item);
  };
  if (verification?.status === "skipped") {
    if (current.checks.missingVerification === "block") blocking.push({ code: "verification.required", severity: "HIGH", message: "Verificação automática é obrigatória para esta configuração." });
    if (current.checks.missingVerification === "warn") addWarning("verification-skipped", {
      code: "verification.skipped", severity: "INFO", message: "Recomendação: não foi encontrada uma verificação automática."
    });
  }
  const hasAcceptanceCriteria = Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0;
  if (hasAcceptanceCriteria && (!Array.isArray(evidence) || evidence.length === 0)) {
    if (current.checks.missingEvidence === "block") blocking.push({ code: "evidence.required", severity: "HIGH", message: "Evidência é obrigatória para os critérios de aceite desta tarefa." });
    if (current.checks.missingEvidence === "recommend") addRecommendation("evidence-missing", { code: "evidence.missing", severity: "INFO", message: "Recomendação: registre evidência para os critérios de aceite desta tarefa." });
  }
  return { mode: current.mode, warnings, recommendations, blocking, sessionWarnings };
}

module.exports = { DEFAULT_CONFIG, mergeConfig, loadGovernanceConfig, writeGovernanceConfig, buildGovernance };
