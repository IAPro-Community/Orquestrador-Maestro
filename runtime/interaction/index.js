"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { CANONICAL_DIR_NAME, LEGACY_DIR_NAME } = require("../config/maestro-paths");

const CATALOG_PATH = path.resolve(__dirname, "../../orquestrador/INTERACTION_PROFILES.json");
const IDS = Object.freeze(["default", "focus"]);
const FIELD_RULES = Object.freeze({
  leadWithAction: "boolean", showProgress: "boolean", showCompletionEvidence: "boolean",
  maxVisibleItems: "positiveInteger", suppressTangents: "boolean",
  nextAction: ["when-relevant", "when-required"], errorFormat: ["standard", "cause-fix"],
  timeEstimate: ["disabled", "telemetry-only"]
});

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { throw new Error(`${label} inválido ou inacessível: ${filePath} (${error.message})`); }
}

function validateProfile(profile, id) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error(`Interaction profile inválido: ${id}`);
  const expected = Object.keys(FIELD_RULES);
  const unknown = Object.keys(profile).filter((key) => !expected.includes(key));
  if (unknown.length) throw new Error(`Interaction profile ${id} contém campos desconhecidos: ${unknown.join(", ")}`);
  for (const key of expected) {
    if (!(key in profile)) throw new Error(`Interaction profile ${id} está incompleto: ${key}`);
    const rule = FIELD_RULES[key]; const value = profile[key];
    if (rule === "boolean" && typeof value !== "boolean") throw new Error(`Interaction profile ${id}.${key} deve ser booleano.`);
    if (rule === "positiveInteger" && (!Number.isInteger(value) || value < 1)) throw new Error(`Interaction profile ${id}.${key} deve ser inteiro positivo.`);
    if (Array.isArray(rule) && !rule.includes(value)) throw new Error(`Interaction profile ${id}.${key} possui valor inválido: ${String(value)}.`);
  }
  return Object.freeze({ ...profile });
}

function loadInteractionCatalog(catalogPath = CATALOG_PATH) {
  const catalog = readJson(catalogPath, "Catálogo de interaction profiles");
  if (catalog.version !== 1 || !catalog.profiles || typeof catalog.profiles !== "object") throw new Error("Catálogo de interaction profiles inválido: version/profiles obrigatórios.");
  if (!IDS.includes(catalog.defaultProfile)) throw new Error(`Perfil padrão desconhecido: ${catalog.defaultProfile}`);
  const keys = Object.keys(catalog.profiles);
  const unknown = keys.filter((key) => !IDS.includes(key));
  if (unknown.length) throw new Error(`Catálogo contém profiles desconhecidos: ${unknown.join(", ")}`);
  for (const id of IDS) if (!catalog.profiles[id]) throw new Error(`Catálogo incompleto: profile ${id} ausente.`);
  return Object.freeze({ version: 1, defaultProfile: catalog.defaultProfile, profiles: Object.freeze(Object.fromEntries(IDS.map((id) => [id, validateProfile(catalog.profiles[id], id)]))) });
}

function configCandidates({ cwd = process.cwd(), home = os.homedir() } = {}) {
  return [
    { source: "project", scope: "project", path: path.join(path.resolve(cwd), CANONICAL_DIR_NAME, "config.json") },
    { source: "project", scope: "project", path: path.join(path.resolve(cwd), LEGACY_DIR_NAME, "maestro-config.json") },
    { source: "user", scope: "user", path: path.join(path.resolve(home), CANONICAL_DIR_NAME, "config.json") },
    { source: "user", scope: "user", path: path.join(path.resolve(home), LEGACY_DIR_NAME, "maestro-config.json") }
  ];
}

function readInteractionConfig(candidate) {
  if (!fs.existsSync(candidate.path)) return null;
  const config = readJson(candidate.path, "Configuração Maestro");
  if (config.interactionProfile === undefined) return null;
  if (!IDS.includes(config.interactionProfile)) throw new Error(`interactionProfile inválido: ${String(config.interactionProfile)}`);
  return { ...candidate, config };
}

function resolveInteractionProfile({ cwd = process.cwd(), home = os.homedir(), cliProfile, catalog } = {}) {
  const resolvedCatalog = catalog || loadInteractionCatalog();
  if (cliProfile !== undefined) {
    if (!IDS.includes(cliProfile)) throw new Error(`Interaction profile desconhecido: ${cliProfile}`);
    return { id: cliProfile, profile: resolvedCatalog.profiles[cliProfile], source: "cli", scope: "invocation" };
  }
  for (const candidate of configCandidates({ cwd, home })) {
    const found = readInteractionConfig(candidate);
    if (found) return { id: found.config.interactionProfile, profile: resolvedCatalog.profiles[found.config.interactionProfile], source: found.source, scope: found.scope, path: found.path };
  }
  const id = resolvedCatalog.defaultProfile;
  return { id, profile: resolvedCatalog.profiles[id], source: "default", scope: "invocation" };
}

function writeConfig(filePath, config) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try { fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 }); fs.renameSync(temporary, filePath); }
  catch (error) { try { fs.rmSync(temporary, { force: true }); } catch {} throw error; }
}

function setInteractionProfile({ cwd = process.cwd(), home = os.homedir(), id, scope = "project" } = {}) {
  if (!IDS.includes(id)) throw new Error(`Interaction profile desconhecido: ${id}`);
  if (!["project", "user"].includes(scope)) throw new Error("scope deve ser project ou user.");
  const base = scope === "project" ? path.resolve(cwd) : path.resolve(home);
  const filePath = path.join(base, CANONICAL_DIR_NAME, "config.json");
  let config = {};
  if (fs.existsSync(filePath)) config = readJson(filePath, "Configuração Maestro");
  config.interactionProfile = id;
  writeConfig(filePath, config);
  return { id, scope, path: filePath, config };
}

function resetInteractionProfile({ cwd = process.cwd(), home = os.homedir(), scope = "project" } = {}) {
  if (!["project", "user"].includes(scope)) throw new Error("scope deve ser project ou user.");
  const base = scope === "project" ? path.resolve(cwd) : path.resolve(home);
  const filePath = path.join(base, CANONICAL_DIR_NAME, "config.json");
  if (!fs.existsSync(filePath)) return { scope, path: filePath, changed: false };
  const config = readJson(filePath, "Configuração Maestro");
  if (!("interactionProfile" in config)) return { scope, path: filePath, changed: false };
  delete config.interactionProfile; writeConfig(filePath, config);
  return { scope, path: filePath, changed: true, config };
}

function interactionContract(resolved) {
  if (resolved?.id !== "focus") return "";
  return "Interaction profile: focus\n\nCommunication requirements:\n- expose current state\n- show next action when required\n- suppress unrelated tangents\n- maximum visible working set: 5\n- report failures as failure → evidence → corrective action\n- completion requires evidence";
}

module.exports = { IDS, CATALOG_PATH, configCandidates, interactionContract, loadInteractionCatalog, resetInteractionProfile, resolveInteractionProfile, setInteractionProfile, validateProfile };
