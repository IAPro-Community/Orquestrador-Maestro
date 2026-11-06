"use strict";

// Trusted, side-effect-free catalog contract. No provider is inferred from a product name.
// Only adapters may attest a connection/model as "ready"; user policy is not an attestation.
const KINDS = new Set(["agent-harness", "model-api", "local-tool"]);
const AUTH = new Set(["chatgpt-subscription", "api-key", "oauth", "local", "unknown"]);
const MODEL_CONTROL = new Set(["per-run", "session-only", "default-only", "unknown"]);
const STATUS = new Set(["ready", "unverified", "unavailable"]);
const TIERS = new Set(["fast", "standard", "deep"]);
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,127}$/;
const CAPABILITY = /^[a-z][a-z0-9.-]{0,79}$/;

function invalid(message) {
  const error = new TypeError(message);
  error.code = "INVALID_CAPABILITY_CATALOG";
  return error;
}
function object(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(where + " must be an object");
  return value;
}
function keys(value, permitted, where) {
  for (const key of Object.keys(value)) if (!permitted.includes(key)) throw invalid(where + ": unknown field " + key);
}
function identifier(value, where) {
  if (typeof value !== "string" || !ID.test(value) || value.includes("..")) throw invalid(where + " invalid");
  return value;
}
function enumField(value, allowed, where) {
  if (!allowed.has(value)) throw invalid(where + " invalid");
  return value;
}
function capabilities(value, where) {
  if (!Array.isArray(value) || value.length > 64 ||
      value.some(v => typeof v !== "string" || !CAPABILITY.test(v)) ||
      new Set(value).size !== value.length) throw invalid(where + " must be a bounded capability array");
  return Object.freeze([...value].sort());
}
function normalizeModel(value) {
  object(value, "model");
  keys(value, ["id", "tier", "status", "capabilities"], "model");
  const model = {
    id: identifier(value.id, "model.id"),
    tier: enumField(value.tier, TIERS, "model.tier"),
    status: enumField(value.status, STATUS, "model.status"),
    capabilities: capabilities(value.capabilities, "model.capabilities")
  };
  return Object.freeze(model);
}
function normalizeConnection(value) {
  object(value, "connection");
  keys(value, ["id", "kind", "auth", "status", "modelControl", "defaultModelId",
    "capabilities", "models"], "connection");
  const id = identifier(value.id, "connection.id");
  const kind = enumField(value.kind, KINDS, "connection.kind");
  const status = enumField(value.status, STATUS, "connection.status");
  const auth = enumField(value.auth, AUTH, "connection.auth");
  const modelControl = enumField(value.modelControl, MODEL_CONTROL, "connection.modelControl");
  const caps = capabilities(value.capabilities, "connection.capabilities");
  const provided = value.models === undefined ? [] : value.models;
  if (!Array.isArray(provided) || provided.length > 128) throw invalid("connection.models must be bounded");
  const models = provided.map(normalizeModel);
  if (new Set(models.map(m => m.id)).size !== models.length) throw invalid("connection contains duplicate model IDs");
  if (kind === "local-tool" && (models.length || value.defaultModelId !== undefined || modelControl !== "unknown"))
    throw invalid("local-tool must not advertise model selection");
  if (kind !== "local-tool" && modelControl === "default-only" && value.defaultModelId === undefined)
    throw invalid("default-only model control requires a known default model");
  let defaultModelId = null;
  if (value.defaultModelId !== undefined && value.defaultModelId !== null) {
    defaultModelId = identifier(value.defaultModelId, "defaultModelId");
    if (!models.some(m => m.id === defaultModelId)) throw invalid("default model is not cataloged");
  }
  return Object.freeze({ id, kind, auth, status, modelControl,
    defaultModelId, capabilities: caps, models: Object.freeze(models) });
}
function normalizeCatalog(value) {
  if (!Array.isArray(value) || value.length > 64) throw invalid("catalog must have at most 64 connections");
  const entries = value.map(normalizeConnection);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw invalid("duplicate connection ID");
  return Object.freeze(entries);
}
module.exports = { normalizeCatalog, normalizeConnection };
