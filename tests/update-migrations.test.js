"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { mergeConfigFiles, migrateConfig } = require("../scripts/update-migrations");
const ROOT = path.resolve(__dirname, "..");

test("config migration adds a version marker without dropping user keys", () => {
  const migrated = migrateConfig({ interactionProfile: "focus", extensions: { custom: true } });
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.interactionProfile, "focus");
  assert.deepEqual(migrated.extensions, { custom: true });
});

test("config merge keeps canonical precedence and migrates each legacy source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-config-migration-"));
  const legacy = path.join(root, "legacy.json");
  const canonical = path.join(root, "config.json");
  fs.writeFileSync(legacy, JSON.stringify({ interactionProfile: "focus", legacyOnly: true }));
  fs.writeFileSync(canonical, JSON.stringify({ interactionProfile: "default", canonicalOnly: true }));
  const result = mergeConfigFiles([legacy, canonical]);
  assert.deepEqual(result.config, {
    schemaVersion: 1,
    interactionProfile: "default",
    legacyOnly: true,
    canonicalOnly: true,
  });
  assert.deepEqual(result.usedSources, [legacy, canonical]);
});

test("config migration fails closed on invalid JSON and unsupported future schemas", () => {
  assert.throws(() => migrateConfig({ schemaVersion: 99 }), /newer than supported/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-invalid-config-"));
  const invalid = path.join(root, "config.json");
  fs.writeFileSync(invalid, "{broken");
  assert.throws(() => mergeConfigFiles([invalid]), /Cannot migrate invalid configuration/);
});

test("versioned update policy matches the router, skill manifest and config migrator", () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "UPDATE_MIGRATION_POLICY.json"), "utf8"));
  const router = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILLS_ROUTER.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILLS_MANIFEST.json"), "utf8"));
  assert.equal(policy.current.skillsRouter, router.version);
  assert.equal(policy.current.skillsManifest, manifest.version);
  assert.ok(Object.values(manifest.skills).length > 0);
  assert.ok(Object.values(manifest.skills).every((entry) => entry.schemaVersion === policy.current.skillContract));
  assert.equal(policy.current.config, require("../scripts/update-migrations").CURRENT_CONFIG_SCHEMA);
  assert.deepEqual(policy.migrations.managedFiles.supportedFrom, [1, 2]);
  assert.equal(policy.current.nativeSkillSync, require("../orquestrador/bin/sync-managed-skill").STATE_VERSION);
  assert.equal(policy.migrations.nativeSkillSync.currentVersion, policy.current.nativeSkillSync);
});
