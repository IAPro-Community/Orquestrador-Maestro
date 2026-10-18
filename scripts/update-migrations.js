#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CURRENT_CONFIG_SCHEMA = 1;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function migrateConfig(input, source = "config") {
  if (!isRecord(input)) throw new TypeError(`${source} must contain a JSON object`);
  const config = { ...input };
  const schemaVersion = config.schemaVersion === undefined ? 0 : config.schemaVersion;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new TypeError(`${source} has an invalid schemaVersion`);
  }
  if (schemaVersion > CURRENT_CONFIG_SCHEMA) {
    throw new Error(`${source} uses config schema ${schemaVersion}, newer than supported schema ${CURRENT_CONFIG_SCHEMA}`);
  }

  // v0 -> v1 introduces an explicit schema marker while retaining all unknown
  // keys and user values. Later schema changes must be separate functions.
  if (schemaVersion === 0) config.schemaVersion = 1;
  return config;
}

function mergeConfigFiles(sourceFiles) {
  const merged = {};
  const usedSources = [];
  for (const sourcePath of sourceFiles) {
    if (!fs.existsSync(sourcePath)) continue;
    let value;
    try { value = JSON.parse(fs.readFileSync(sourcePath, "utf8")); }
    catch (error) { throw new Error(`Cannot migrate invalid configuration ${sourcePath}: ${error.message}`); }
    Object.assign(merged, migrateConfig(value, sourcePath));
    usedSources.push(sourcePath);
  }
  if (usedSources.length) merged.schemaVersion = CURRENT_CONFIG_SCHEMA;
  return { config: merged, usedSources };
}

function mergeToFile(destination, sourceFiles) {
  const { config, usedSources } = mergeConfigFiles(sourceFiles);
  if (!usedSources.length) return { written: false, schemaVersion: null, usedSources };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, destination);
  } finally { try { fs.unlinkSync(temporary); } catch {} }
  return { written: true, schemaVersion: CURRENT_CONFIG_SCHEMA, usedSources };
}

function main(argv) {
  const [mode, destination, ...sources] = argv;
  if (mode !== "merge" || !destination) {
    throw new Error("Usage: update-migrations.js merge <destination> [legacy-config ...] [canonical-config]");
  }
  const result = mergeToFile(path.resolve(destination), sources.map((source) => path.resolve(source)));
  if (result.written) console.log(`Migrated config schema to v${result.schemaVersion}; merged ${result.usedSources.length} source file(s).`);
  return result;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`update-migrations: ${error.message}`); process.exitCode = 1; }
}

module.exports = { CURRENT_CONFIG_SCHEMA, migrateConfig, mergeConfigFiles, mergeToFile, main };
