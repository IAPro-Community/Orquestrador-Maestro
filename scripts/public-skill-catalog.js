#!/usr/bin/env node

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { findSkillFiles, normalizeId, parseFrontmatter } = require("../runtime/skills/discovery");

const SOURCE_ROOTS = [
  { key: "maestro", relativeRoot: "orquestrador/skills", priority: 100 },
  { key: "codex", relativeRoot: "codex/skills", priority: 90 },
  { key: "community", relativeRoot: "skill-library/community-skills", priority: 80 }
];

function parseArgs(argv) {
  const result = { command: "check", root: path.resolve(__dirname, ".."), output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["generate", "check"].includes(arg)) result.command = arg;
    else if (arg === "--root") result.root = path.resolve(argv[++index]);
    else if (arg === "--output") result.output = path.resolve(argv[++index]);
    else if (arg === "--help" || arg === "-h") result.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function hashSkill(skillFile) {
  return crypto.createHash("sha256").update(fs.readFileSync(skillFile)).digest("hex");
}

function buildCatalog(root) {
  const candidates = [];
  for (const source of SOURCE_ROOTS) {
    const sourceRoot = path.join(root, source.relativeRoot);
    for (const found of findSkillFiles(sourceRoot, true)) {
      const metadata = parseFrontmatter(found.skillFile);
      const id = normalizeId(metadata.name, path.basename(found.skillPath));
      candidates.push({
        id,
        name: metadata.name || id,
        description: metadata.description,
        source: source.key,
        relativePath: path.relative(root, found.skillPath).split(path.sep).join("/"),
        contentHash: hashSkill(found.skillFile),
        priority: source.priority
      });
    }
  }

  const selected = new Map();
  for (const candidate of candidates.sort((left, right) =>
    right.priority - left.priority || left.id.localeCompare(right.id) || left.relativePath.localeCompare(right.relativePath)
  )) {
    if (!selected.has(candidate.id)) selected.set(candidate.id, candidate);
  }

  const duplicates = candidates.filter((candidate) => selected.get(candidate.id) !== candidate);
  const conflicts = [...new Set(duplicates
    .filter((candidate) => candidate.contentHash !== selected.get(candidate.id).contentHash)
    .map((candidate) => candidate.id))].sort();

  return {
    schemaVersion: 1,
    source: "repository-public-sources",
    identity: "frontmatter.name normalized to skill id",
    precedence: SOURCE_ROOTS.map((source) => source.key),
    counts: {
      sourceSkillFiles: candidates.length,
      uniqueSkills: selected.size,
      shadowedDuplicates: duplicates.length,
      conflictingIds: conflicts.length
    },
    skills: [...selected.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ priority, ...skill }) => skill),
    conflicts
  };
}

function updatePackageManifest(root, catalog) {
  const manifestPath = path.join(root, "skill-library", "MANIFEST.json");
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.packages = manifest.packages || {};
  manifest.packages.publicCatalog = {
    path: "skill-library/PUBLIC_SKILLS_MANIFEST.json",
    uniqueSkills: catalog.counts.uniqueSkills,
    sourceSkillFiles: catalog.counts.sourceSkillFiles,
    shadowedDuplicates: catalog.counts.shadowedDuplicates,
    conflictingIds: catalog.counts.conflictingIds
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/public-skill-catalog.js <generate|check> [--root PATH] [--output PATH]");
    return;
  }
  const output = options.output || path.join(options.root, "skill-library", "PUBLIC_SKILLS_MANIFEST.json");
  const catalog = buildCatalog(options.root);
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
  if (options.command === "generate") {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialized, "utf8");
    updatePackageManifest(options.root, catalog);
    console.log(`Public skill catalog generated: ${catalog.counts.uniqueSkills} unique skills.`);
    return;
  }
  if (!fs.existsSync(output)) throw new Error(`Missing public skill catalog: ${output}`);
  const current = fs.readFileSync(output, "utf8");
  if (current !== serialized) throw new Error(`Public skill catalog is stale: ${output}. Run public-skill-catalog.js generate.`);
  const packageManifestPath = path.join(options.root, "skill-library", "MANIFEST.json");
  if (fs.existsSync(packageManifestPath)) {
    const packageManifest = JSON.parse(fs.readFileSync(packageManifestPath, "utf8"));
    const summary = packageManifest.packages?.publicCatalog;
    if (JSON.stringify(summary) !== JSON.stringify({
      path: "skill-library/PUBLIC_SKILLS_MANIFEST.json",
      uniqueSkills: catalog.counts.uniqueSkills,
      sourceSkillFiles: catalog.counts.sourceSkillFiles,
      shadowedDuplicates: catalog.counts.shadowedDuplicates,
      conflictingIds: catalog.counts.conflictingIds
    })) throw new Error(`skill-library/MANIFEST.json has a stale public catalog summary. Run public-skill-catalog.js generate.`);
  }
  console.log(`Public skill catalog valid: ${catalog.counts.uniqueSkills} unique skills.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { SOURCE_ROOTS, buildCatalog };
