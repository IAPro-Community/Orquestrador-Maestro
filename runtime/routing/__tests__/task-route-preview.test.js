"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCatalog, previewTaskRoute } = require("../index");

function fixture() {
  return [
    { id: "codex-chatgpt", kind: "agent-harness", auth: "chatgpt-subscription",
      status: "ready", modelControl: "per-run", defaultModelId: "gpt-6.1-sol",
      capabilities: ["code.edit", "tool.call"], models: [
        { id: "gpt-6-luna", tier: "fast", status: "ready", capabilities: ["text.generate"] },
        { id: "gpt-6.1-sol", tier: "standard", status: "ready", capabilities: ["text.generate"] }
      ] },
    { id: "anthropic-api", kind: "model-api", auth: "api-key", status: "ready",
      modelControl: "per-run", defaultModelId: "claude-sonnet",
      capabilities: [], models: [
        { id: "claude-sonnet", tier: "standard", status: "ready", capabilities: ["text.generate"] },
        { id: "claude-opus", tier: "deep", status: "ready", capabilities: ["text.generate"] }
      ] },
    { id: "local-process", kind: "local-tool", auth: "local", status: "ready",
      modelControl: "unknown", capabilities: ["process.execute"], models: [] }
  ];
}
function modelTask(extra = {}) {
  return { kind: "model", requiredCapabilities: ["text.generate"], ...extra };
}

test("does not infer Luna from the ChatGPT authentication identity", () => {
  const catalog = fixture();
  catalog[0].models[0].status = "unverified";
  const route = previewTaskRoute({ catalog, task: modelTask(), policy: {
    preferredConnectionId: "codex-chatgpt"
  } });
  assert.equal(route.status, "READY_FOR_REVIEW");
  assert.equal(route.selection.connectionId, "codex-chatgpt");
  assert.equal(route.selection.modelId, "gpt-6.1-sol");
  assert.equal(route.executable, false);
});

test("selects configured fast-tier preference only when model is verified", () => {
  const route = previewTaskRoute({ catalog: fixture(), task: modelTask(),
    policy: { preferredConnectionId: "codex-chatgpt",
      tierPreferences: { fast: { connectionId: "codex-chatgpt", modelId: "gpt-6-luna" } } } });
  assert.equal(route.selection.modelId, "gpt-6-luna");
});

test("manual model lock cannot silently fall back to another model or provider", () => {
  const catalog = fixture();
  catalog[0].models[0].status = "unavailable";
  const route = previewTaskRoute({ catalog,
    task: modelTask({ requestedConnectionId: "codex-chatgpt", requestedModelId: "gpt-6-luna" }),
    policy: { mode: "locked", allowCrossProviderFallback: true } });
  assert.equal(route.status, "BLOCKED");
  assert.equal(route.selection, null);
});

test("deep reasoning selects only a compatible verified model", () => {
  const route = previewTaskRoute({ catalog: fixture(),
    task: modelTask({ minimumTier: "deep" }),
    policy: { allowCrossProviderFallback: true, profile: "quality" } });
  assert.equal(route.selection.modelId, "claude-opus");
  assert.equal(route.selection.connectionId, "anthropic-api");
});

test("tools execute outside model routing without AI inference", () => {
  const route = previewTaskRoute({ catalog: fixture(),
    task: { kind: "tool", requiredCapabilities: ["process.execute"] } });
  assert.equal(route.status, "READY_FOR_REVIEW");
  assert.equal(route.selection.connectionKind, "local-tool");
  assert.equal(route.selection.modelId, null);
});

test("missing tool capabilities fail closed", () => {
  const route = previewTaskRoute({ catalog: fixture(),
    task: { kind: "tool", requiredCapabilities: ["git.push"] } });
  assert.equal(route.status, "BLOCKED");
  assert.equal(route.blockers[0].code, "NO_VERIFIED_COMPATIBLE_EXECUTOR");
});

test("session-only adapters cannot be switched atomically to another model", () => {
  const catalog = fixture();
  catalog[0].modelControl = "session-only";
  const route = previewTaskRoute({ catalog,
    task: modelTask({ requestedConnectionId: "codex-chatgpt", requestedModelId: "gpt-6-luna" }) });
  assert.equal(route.status, "BLOCKED");
  const defaultRoute = previewTaskRoute({ catalog,
    task: modelTask({ requestedConnectionId: "codex-chatgpt", requestedModelId: "gpt-6.1-sol" }) });
  assert.equal(defaultRoute.status, "READY_FOR_REVIEW");
});

test("no model choice when connection remains unverified", () => {
  const catalog = fixture();
  catalog[0].status = "unverified";
  const result = previewTaskRoute({ catalog, task: modelTask(),
    policy: { preferredConnectionId: "codex-chatgpt" } });
  assert.equal(result.status, "BLOCKED");
});

test("cross-provider fallback requires explicit policy and cannot override task locks", () => {
  const catalog = fixture();
  catalog[0].status = "unavailable";
  const blocked = previewTaskRoute({ catalog, task: modelTask(),
    policy: { preferredConnectionId: "codex-chatgpt" } });
  assert.equal(blocked.status, "BLOCKED");
  const fallback = previewTaskRoute({ catalog, task: modelTask(),
    policy: { preferredConnectionId: "codex-chatgpt", allowCrossProviderFallback: true } });
  assert.equal(fallback.status, "READY_FOR_REVIEW");
  assert.equal(fallback.selection.connectionId, "anthropic-api");
  assert.ok(fallback.reasons.includes("CROSS_PROVIDER_FALLBACK_PREVIEW"));
});

test("schema rejects duplicate connections, secret-like extra fields and fake defaults", () => {
  assert.throws(() => normalizeCatalog([fixture()[0], fixture()[0]]), /duplicate connection/);
  const credentials = fixture();
  credentials[0].token = "do-not-store";
  assert.throws(() => normalizeCatalog(credentials), /unknown field token/);
  const forged = fixture();
  forged[0].defaultModelId = "gpt-6-unknown";
  assert.throws(() => normalizeCatalog(forged), /default model is not cataloged/);
});

test("preview is inert and validates request boundaries", () => {
  assert.throws(() => previewTaskRoute({catalog: fixture(),
    task: modelTask({ requestedModelId: "gpt-6-luna" })}), /requires a connection lock/);
  assert.throws(() => previewTaskRoute({catalog: fixture(),
    task: modelTask(), policy: { allowedConnectionIds: ["../escape"] }}), /invalid allowedConnectionIds/);
  const normalized = normalizeCatalog(fixture());
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized[0].models));
});
