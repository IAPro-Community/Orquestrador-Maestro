#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createCanonicalSkillContract } = require("../runtime/skills/contract-v2");
const { validateSkillContracts } = require("../runtime/skills/contract-validator");
const { buildCatalog } = require("./public-skill-catalog");
const { applyManifestDefaults } = require("../runtime/skills/registry");

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function auditContracts(root = path.resolve(__dirname, "..")) {
  const manifestPath = path.join(root, "orquestrador", "SKILLS_MANIFEST.json");
  const canonicalManifestPersisted = fs.existsSync(manifestPath);
  const manifest = readJson(manifestPath, { defaults: {}, skills: {} });
  const persistedPublicCatalogPath = path.join(root, "skill-library", "PUBLIC_SKILLS_MANIFEST.json");
  const publicCatalogPersisted = fs.existsSync(persistedPublicCatalogPath);
  const persistedPublicCatalog = readJson(persistedPublicCatalogPath, null);
  const publicCatalog = buildCatalog(root);

  const records = [];
  const constructionIssues = [];
  let nativeCanonicalSkills = 0;

  for (const [id, entry] of Object.entries(manifest.skills || {})) {
    const effectiveEntry = applyManifestDefaults(manifest, entry);
    try {
      const contract = createCanonicalSkillContract(id, effectiveEntry);
      nativeCanonicalSkills += 1;
      records.push({
        identity: `maestro/${id}`,
        id,
        contract
      });
    } catch (error) {
      constructionIssues.push(Object.freeze({
        code: "NON_NATIVE_CANONICAL_SKILL",
        id,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  const validation = validateSkillContracts(records);
  const issues = Object.freeze([
    ...constructionIssues,
    ...validation.issues
  ]);
  const issueCounts = issues.reduce((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {});

  const canonicalSkills = Object.keys(manifest.skills || {}).length;
  const nonNativeCanonicalSkills = canonicalSkills - nativeCanonicalSkills;
  const canonicalManifestVersion = Number.isInteger(manifest.version) ? manifest.version : null;
  const publicConflicts = Array.isArray(publicCatalog.conflicts) ? publicCatalog.conflicts : [];
  const publicCatalogStale = !publicCatalogPersisted
    || JSON.stringify(persistedPublicCatalog) !== JSON.stringify(publicCatalog);

  const migrationBlockers = [];
  if (!canonicalManifestPersisted) migrationBlockers.push("CANONICAL_MANIFEST_MISSING");
  if (canonicalManifestPersisted && canonicalManifestVersion !== 3) migrationBlockers.push("CANONICAL_MANIFEST_VERSION_INVALID");
  if (canonicalManifestPersisted && canonicalSkills === 0) migrationBlockers.push("CANONICAL_SKILLS_EMPTY");
  if (nonNativeCanonicalSkills > 0) migrationBlockers.push("NON_NATIVE_CANONICAL_SKILLS");
  if (publicConflicts.length > 0) migrationBlockers.push("PUBLIC_ID_CONFLICTS_REMAIN");
  if (!publicCatalogPersisted) migrationBlockers.push("PUBLIC_CATALOG_MISSING");
  else if (publicCatalogStale) migrationBlockers.push("PUBLIC_CATALOG_STALE");
  if (issues.length > constructionIssues.length) migrationBlockers.push("CONTRACT_VALIDATION_ISSUES");

  return Object.freeze({
    schemaVersion: 2,
    canonicalManifestPersisted,
    canonicalManifestVersion,
    canonicalSkills,
    nativeCanonicalSkills,
    nonNativeCanonicalSkills,
    contractIssues: issues.length,
    issueCounts: Object.freeze({ ...issueCounts }),
    publicCatalog: Object.freeze({
      uniqueSkills: publicCatalog.counts?.uniqueSkills ?? null,
      shadowedDuplicates: publicCatalog.counts?.shadowedDuplicates ?? null,
      conflictingIds: publicCatalog.counts?.conflictingIds ?? publicConflicts.length,
      conflicts: Object.freeze([...publicConflicts]),
      persisted: publicCatalogPersisted,
      stale: publicCatalogStale
    }),
    migrationScope: "maestro-canonical-skills",
    externalCompatibilityScope: "external-user-project-skills",
    migrationReady: migrationBlockers.length === 0,
    migrationBlockers: Object.freeze(migrationBlockers),
    issues
  });
}

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    json: argv.includes("--json")
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = auditContracts();

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Maestro Skill Contract V2 audit");
    console.log(`Canonical manifest persisted: ${result.canonicalManifestPersisted ? "yes" : "no"}`);
    console.log(`Canonical manifest version: ${result.canonicalManifestVersion ?? "missing"}`);
    console.log(`Canonical skills: ${result.canonicalSkills}`);
    console.log(`Native canonical V2 skills: ${result.nativeCanonicalSkills}`);
    console.log(`Non-native canonical skills: ${result.nonNativeCanonicalSkills}`);
    console.log(`Contract issues: ${result.contractIssues}`);
    console.log(`Public conflicting IDs: ${result.publicCatalog.conflictingIds}`);
    console.log(`Public catalog persisted: ${result.publicCatalog.persisted ? "yes" : "no"}`);
    console.log(`Public catalog stale: ${result.publicCatalog.stale ? "yes" : "no"}`);
    console.log(`Migration scope: ${result.migrationScope}`);
    console.log(`External compatibility scope: ${result.externalCompatibilityScope}`);
    if (result.publicCatalog.conflicts.length > 0) {
      console.log(`Conflicts: ${result.publicCatalog.conflicts.join(", ")}`);
    }
    for (const [code, count] of Object.entries(result.issueCounts)) {
      console.log(`${code}: ${count}`);
    }
    if (result.migrationBlockers.length > 0) {
      console.log(`Migration blockers: ${result.migrationBlockers.join(", ")}`);
    }
    console.log(`Migration ready: ${result.migrationReady ? "yes" : "no"}`);
  }

  if (options.strict && !result.migrationReady) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { auditContracts, parseArgs };
