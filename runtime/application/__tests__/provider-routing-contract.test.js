"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ProviderRegistry, normalizeProviderAttempts } = require("../maestro-application");

test("AGY and OpenCode remain first-class independent Maestro providers", async () => {
  const providers = new ProviderRegistry();
  for (const name of ["agy", "opencode", "codex", "claude"]) {
    const adapter = providers.get(name);
    assert.ok(adapter, name + " missing from canonical provider registry");
    assert.equal(adapter.id, name);
  }
  const agy = await providers.get("agy").capabilities();
  const opencode = await providers.get("opencode").capabilities();
  assert.equal(agy.toolApproval, true);
  assert.equal(agy.sandboxControl, true);
  assert.equal(opencode.mcp, true);
  assert.equal(opencode.sandboxControl, false, "must not invent a read-only sandbox");
});

test("user-selected provider and model remain intact per independently delegated task", () => {
  const frontend = normalizeProviderAttempts({
    providerId: "agy", model: "frontend-model"
  });
  const backend = normalizeProviderAttempts({
    providerId: "opencode", model: "backend-model"
  });
  assert.deepEqual(frontend, [{ providerId: "agy", model: "frontend-model" }]);
  assert.deepEqual(backend, [{ providerId: "opencode", model: "backend-model" }]);
  assert.equal(frontend.length, 1, "no silent provider fallback");
  assert.equal(backend.length, 1, "no silent provider fallback");
});

test("provider fallbacks require an explicit caller-provided alternative", () => {
  const noFallback = normalizeProviderAttempts({ providerId: "agy", providerFallbacks: [] });
  assert.deepEqual(noFallback, [{ providerId: "agy", model: undefined }]);
  const explicitlyAuthorized = normalizeProviderAttempts({
    providerId: "agy", providerFallbacks: [{ providerId: "opencode", model: "fallback-model" }]
  });
  assert.deepEqual(explicitlyAuthorized, [
    { providerId: "agy", model: undefined },
    { providerId: "opencode", model: "fallback-model" }
  ]);
  assert.equal(normalizeProviderAttempts({ providerId: "opencode" }).length, 1);
});
