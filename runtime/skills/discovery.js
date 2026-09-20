"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SKILL_FILE = "SKILL.md";
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "logs", "backups", ".cache", ".tmp", "cache"]);

// Public/package roots come first. A public install must resolve one stable
// skill per id even though the repository keeps compatibility mirrors.
const PUBLIC_SOURCE_DEFINITIONS = [
  { key: "maestro", relativeRoot: "skills", namespace: "maestro", source: "maestro", priority: 100 },
  { key: "library-codex", relativeRoot: "skill-library/codex-skills", namespace: "library/codex", source: "library", priority: 90 },
  { key: "library-community", relativeRoot: "skill-library/community-skills", namespace: "library/community", source: "library", priority: 80 }
];

const USER_SOURCE_DEFINITIONS = [
  { key: "codex", relativeRoot: ".codex/skills", namespace: "user/codex", source: "user", priority: 70 },
  { key: "agents", relativeRoot: ".agents/skills", namespace: "user/agents", source: "user", priority: 65 },
  { key: "claude", relativeRoot: ".claude/skills", namespace: "user/claude", source: "user", priority: 65 },
  { key: "opencode", relativeRoot: ".opencode/skills", namespace: "user/opencode", source: "user", priority: 65 },
  { key: "cursor", relativeRoot: ".cursor/skills", namespace: "user/cursor", source: "user", priority: 65 },
  { key: "gemini", relativeRoot: ".gemini/skills", namespace: "user/gemini", source: "user", priority: 65 },
  { key: "windsurf", relativeRoot: ".windsurf/skills", namespace: "user/windsurf", source: "user", priority: 65 },
  { key: "antigravity", relativeRoot: ".antigravity-skills/skills", namespace: "user/antigravity", source: "user", priority: 65 }
];

function isDirectory(directory) {
  try { return fs.statSync(directory).isDirectory(); } catch { return false; }
}

function normalizeId(value, fallback) {
  const normalized = String(value || fallback || "")
    .trim()
    .toLowerCase()
    .replace(/^\/?skill:/u, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || String(fallback || "").trim();
}

function parseFrontmatter(skillFile) {
  try {
    const content = fs.readFileSync(skillFile, "utf8");
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u);
    const frontmatter = {};
    if (match) {
      for (const line of match[1].split(/\r?\n/u)) {
        const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
        if (pair) frontmatter[pair[1]] = pair[2].trim().replace(/^['"]|['"]$/gu, "");
      }
    }
    return {
      name: String(frontmatter.name || "").trim(),
      description: String(frontmatter.description || "").trim()
    };
  } catch {
    return { name: "", description: "" };
  }
}

function findSkillFiles(root, recursive = true) {
  if (!isDirectory(root)) return [];
  const result = [];
  const visit = (directory) => {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRECTORIES.has(entry.name)) continue;
      const child = path.join(directory, entry.name);
      const skillFile = path.join(child, SKILL_FILE);
      if (fs.existsSync(skillFile)) {
        result.push({ skillFile, skillPath: child });
        continue;
      }
      if (recursive) visit(child);
    }
  };
  visit(root);
  return result;
}

function resolvePublicRoot(maestroRoot, relativeRoot) {
  const root = path.resolve(maestroRoot || path.join(os.homedir(), ".orquestrador"));
  if (isDirectory(path.join(root, "orquestrador")) && fs.existsSync(path.join(root, "orquestrador", "SKILLS_MANIFEST.json"))) {
    const repositoryRoots = {
      skills: path.join(root, "orquestrador", "skills"),
      "skill-library/codex-skills": path.join(root, "codex", "skills"),
      "skill-library/community-skills": path.join(root, "skill-library", "community-skills")
    };
    if (repositoryRoots[relativeRoot]) return repositoryRoots[relativeRoot];
  }
  const candidates = [
    path.join(root, relativeRoot),
    path.join(root, "orquestrador", relativeRoot)
  ];
  return candidates.find(isDirectory) || candidates[0];
}

function getSources({ userHome = os.homedir(), maestroRoot, includeUserSources = true, sources } = {}) {
  if (sources) return sources;
  const publicSources = PUBLIC_SOURCE_DEFINITIONS.map((definition) => ({
    ...definition,
    absoluteRoot: resolvePublicRoot(maestroRoot, definition.relativeRoot)
  }));
  if (!includeUserSources) return publicSources;
  return [
    ...publicSources,
    ...USER_SOURCE_DEFINITIONS.map((definition) => ({
      ...definition,
      absoluteRoot: path.resolve(userHome, definition.relativeRoot)
    }))
  ];
}

function discoverSkills({ userHome = os.homedir(), maestroRoot, includeUserSources = true, sources } = {}) {
  const home = path.resolve(userHome);
  const files = [];
  const seenFiles = new Set();
  for (const source of getSources({ userHome, maestroRoot, includeUserSources, sources })) {
    const root = source.absoluteRoot || path.resolve(home, source.relativeRoot);
    for (const found of findSkillFiles(root, true)) {
      const fileKey = path.resolve(found.skillFile).toLowerCase();
      if (seenFiles.has(fileKey)) continue;
      seenFiles.add(fileKey);
      const metadata = parseFrontmatter(found.skillFile);
      const fallback = path.basename(found.skillPath);
      const id = normalizeId(metadata.name, fallback);
      files.push({
        id,
        name: metadata.name || id,
        description: metadata.description,
        namespace: source.namespace,
        source: source.source,
        provider: source.key,
        root: source.key,
        relativePath: path.relative(home, found.skillPath).split(path.sep).join("/"),
        path: found.skillPath,
        priority: source.priority
      });
    }
  }

  const selected = new Map();
  for (const record of files.sort((left, right) =>
    right.priority - left.priority || left.id.localeCompare(right.id) || left.path.localeCompare(right.path)
  )) {
    // The invocation namespace is the skill id, not the installation mirror.
    // This prevents the same skill from appearing once per agent/provider.
    if (!selected.has(record.id)) selected.set(record.id, record);
  }

  return {
    files: Object.freeze(files),
    skills: Object.freeze([...selected.values()].map((record) => Object.freeze(record)))
  };
}

function buildInventory({ userHome = os.homedir(), maestroRoot, generatedAt = new Date().toISOString() } = {}) {
  const discovery = discoverSkills({ userHome, maestroRoot, includeUserSources: false });
  const root = maestroRoot || path.join(userHome, ".orquestrador");
  const canonicalManifestPath = fs.existsSync(path.join(root, "SKILLS_MANIFEST.json"))
    ? path.join(root, "SKILLS_MANIFEST.json")
    : path.join(root, "orquestrador", "SKILLS_MANIFEST.json");
  let canonicalCount = 0;
  try {
    canonicalCount = Object.keys(JSON.parse(fs.readFileSync(canonicalManifestPath, "utf8")).skills || {}).length;
  } catch { /* The installer may run before the canonical snapshot is available. */ }

  return {
    schemaVersion: 2,
    generatedAt,
    source: "public-installed-catalog",
    counts: {
      discoveredSkillFiles: discovery.skills.length,
      invokableSkills: discovery.skills.length,
      canonicalSkills: canonicalCount,
      sourceSkillFiles: discovery.files.length,
      shadowedDuplicates: discovery.files.length - discovery.skills.length
    },
    skills: discovery.skills.map(({ priority, path: absolutePath, ...record }) => record),
    files: discovery.skills.map(({ priority, path: absolutePath, ...record }) => record)
  };
}

module.exports = {
  PUBLIC_SOURCE_DEFINITIONS,
  USER_SOURCE_DEFINITIONS,
  buildInventory,
  discoverSkills,
  findSkillFiles,
  normalizeId,
  parseFrontmatter
};
