"use strict";

const { normalizeCatalog } = require("./capability-registry");

const MODES = new Set(["auto", "preferred", "locked"]);
const PROFILES = new Set(["economy", "balanced", "quality"]);
const TIERS = ["fast", "standard", "deep"];
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/+-]{0,127}$/;
const CAP = /^[a-z][a-z0-9.-]{0,79}$/;

function invalid(message) {
  const error = new TypeError(message);
  error.code = "INVALID_ROUTING_REQUEST";
  return error;
}
function record(value, keys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(k => !keys.includes(k))) throw invalid("invalid " + name);
  return value;
}
function optionalId(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !ID.test(value) || value.includes("..")) throw invalid("invalid " + field);
  return value;
}
function normalizedPolicy(value = {}) {
  record(value, ["mode", "profile", "allowedConnectionIds", "preferredConnectionId",
    "allowCrossProviderFallback", "tierPreferences"], "policy");
  const mode = value.mode || "auto";
  const profile = value.profile || "balanced";
  if (!MODES.has(mode) || !PROFILES.has(profile)) throw invalid("invalid routing mode/profile");
  const ids = value.allowedConnectionIds;
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > 64 ||
      ids.some(id => !optionalId(id, "allowedConnectionIds")) || new Set(ids).size !== ids.length))
    throw invalid("invalid allowedConnectionIds");
  const prefs = value.tierPreferences || {};
  record(prefs, TIERS, "tierPreferences");
  for (const tier of Object.keys(prefs)) {
    record(prefs[tier], ["connectionId", "modelId"], "tierPreference");
    optionalId(prefs[tier].connectionId, "tierPreference.connectionId");
    optionalId(prefs[tier].modelId, "tierPreference.modelId");
  }
  if (value.allowCrossProviderFallback !== undefined &&
      typeof value.allowCrossProviderFallback !== "boolean") throw invalid("invalid allowCrossProviderFallback");
  return { mode, profile, allowed: ids ? new Set(ids) : null,
    preferredConnectionId: optionalId(value.preferredConnectionId, "preferredConnectionId"),
    allowCrossProviderFallback: value.allowCrossProviderFallback === true, tierPreferences: prefs };
}
function normalizedTask(value) {
  record(value, ["kind", "requiredCapabilities", "minimumTier",
    "requestedConnectionId", "requestedModelId"], "task");
  const kind = value.kind;
  if (kind !== "model" && kind !== "tool") throw invalid("task.kind must be model or tool");
  const required = value.requiredCapabilities || [];
  if (!Array.isArray(required) || required.length > 64 ||
      required.some(v => typeof v !== "string" || !CAP.test(v)) ||
      new Set(required).size !== required.length) throw invalid("invalid requiredCapabilities");
  const minimumTier = value.minimumTier || "fast";
  if (!TIERS.includes(minimumTier)) throw invalid("invalid minimumTier");
  const requestedConnectionId = optionalId(value.requestedConnectionId, "requestedConnectionId");
  const requestedModelId = optionalId(value.requestedModelId, "requestedModelId");
  if (kind === "tool" && requestedModelId) throw invalid("tool cannot lock a model");
  if (requestedModelId && !requestedConnectionId) throw invalid("model lock requires a connection lock");
  return { kind, required, minimumTier, requestedConnectionId, requestedModelId };
}
function supports(required, connection, model) {
  const available = new Set([...connection.capabilities, ...(model?.capabilities || [])]);
  return required.every(cap => available.has(cap));
}
function permittedModel(connection, model) {
  if (model.status !== "ready") return false;
  if (connection.modelControl === "per-run") return true;
  // Per-session/default-only/unknown cannot prove an atomic per-task override.
  return connection.defaultModelId === model.id;
}
function previewTaskRoute({ catalog, task, policy = {} } = {}) {
  const connections = normalizeCatalog(catalog);
  const request = normalizedTask(task);
  const options = normalizedPolicy(policy);
  if (options.mode === "locked" && !request.requestedConnectionId) {
    throw invalid("locked mode requires task.requestedConnectionId");
  }
  if (options.mode === "locked" && request.kind === "model" && !request.requestedModelId) {
    throw invalid("locked model routing requires task.requestedModelId");
  }
  const candidates = [];
  for (const connection of connections) {
    if (connection.status !== "ready") continue;
    if (options.allowed && !options.allowed.has(connection.id)) continue;
    if (request.requestedConnectionId && request.requestedConnectionId !== connection.id) continue;
    if (!request.requestedConnectionId && options.preferredConnectionId &&
        !options.allowCrossProviderFallback && connection.id !== options.preferredConnectionId) continue;
    if (request.kind === "tool") {
      if (connection.kind === "local-tool" && supports(request.required, connection, null)) {
        candidates.push({ connectionId: connection.id, modelId: null, tier: null, connectionKind: connection.kind });
      }
      continue;
    }
    if (connection.kind === "local-tool") continue;
    for (const model of connection.models) {
      if (TIERS.indexOf(model.tier) < TIERS.indexOf(request.minimumTier)) continue;
      if (request.requestedModelId && model.id !== request.requestedModelId) continue;
      if (!permittedModel(connection, model) || !supports(request.required, connection, model)) continue;
      if (request.requestedModelId && connection.modelLockGuarantee !== "enforced") continue;
      candidates.push({ connectionId: connection.id, modelId: model.id,
        tier: model.tier, connectionKind: connection.kind,
        modelReporting: connection.modelReporting });
    }
  }
  const ordered = candidates.map(c => {
    const pref = c.tier ? options.tierPreferences[c.tier] : null;
    const preferenceScore = Number(c.connectionId === options.preferredConnectionId) +
      Number(!!pref && pref.connectionId === c.connectionId) +
      Number(!!pref && pref.modelId === c.modelId);
    const rank = c.tier === null ? 0 : TIERS.indexOf(c.tier);
    const tierScore = options.profile === "quality" ? -rank : rank;
    return { ...c, preferenceScore, tierScore };
  }).sort((a,b) => a.tierScore - b.tierScore ||
    b.preferenceScore - a.preferenceScore ||
    a.connectionId.localeCompare(b.connectionId) ||
    (a.modelId || "").localeCompare(b.modelId || ""));
  if (!ordered.length) {
    return Object.freeze({ schemaVersion: 1, authority: "MAESTRO", previewOnly: true,
      executable: false, status: "BLOCKED", selection: null,
      blockers: Object.freeze([{ code: "NO_VERIFIED_COMPATIBLE_EXECUTOR",
        message: "No verified executor satisfies capabilities, locks and model-control limits" }]) });
  }
  const chosen = ordered[0];
  const reasons = ["VERIFIED_CAPABILITY_MATCH",
    request.requestedConnectionId ? "CONNECTION_LOCK_RESPECTED" : "POLICY_SELECTED",
    request.requestedModelId ? "MODEL_LOCK_RESPECTED" : "MODEL_SELECTED_WITHIN_POLICY"];
  if (chosen.modelId && chosen.modelReporting !== "actual-model")
    reasons.push("ACTUAL_MODEL_RECEIPT_NOT_AVAILABLE");
  if (options.preferredConnectionId && chosen.connectionId !== options.preferredConnectionId)
    reasons.push("CROSS_PROVIDER_FALLBACK_PREVIEW");
  return Object.freeze({ schemaVersion: 1, authority: "MAESTRO", previewOnly: true,
    executable: false, status: "READY_FOR_REVIEW",
    selection: Object.freeze({ connectionId: chosen.connectionId, modelId: chosen.modelId,
      tier: chosen.tier, connectionKind: chosen.connectionKind }),
    reasons: Object.freeze(reasons), blockers: Object.freeze([]) });
}
module.exports = { previewTaskRoute };
