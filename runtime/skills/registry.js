"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { discoverSkills, parseFrontmatter } = require("./discovery");
const { createCanonicalSkillContract, projectLegacySkill } = require("./contract-v2");

function isDirectory(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function readSkillMetadata(skillPath, fallback) {
  const filePath = path.join(skillPath, "SKILL.md");
  if (!fs.existsSync(filePath)) return { name: fallback, description: "" };
  const metadata = parseFrontmatter(filePath);
  return {
    name: metadata.name || fallback,
    description: metadata.description || ""
  };
}

function resolveManifestPath(maestroRoot) {
  const candidates = [
    path.join(maestroRoot, "orquestrador", "SKILLS_MANIFEST.json"),
    path.join(maestroRoot, "SKILLS_MANIFEST.json")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function readManifestDocument(maestroRoot) {
  const manifestPath = resolveManifestPath(maestroRoot);
  if (!manifestPath) return { defaults: {}, skills: {} };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid skill manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!manifest.skills || typeof manifest.skills !== "object" || Array.isArray(manifest.skills)) {
    throw new Error(`Invalid skill manifest at ${manifestPath}: skills must be an object`);
  }
  return manifest;
}

function applyManifestDefaults(manifest, entry = {}) {
  const defaults = manifest?.defaults && typeof manifest.defaults === "object" ? manifest.defaults : {};
  const effective = { ...entry };
  if (defaults.provenance || entry.provenance) {
    effective.provenance = {
      ...(defaults.provenance || {}),
      ...(entry.provenance || {})
    };
  }
  if (defaults.workflow || entry.workflow) {
    effective.workflow = {
      ...(defaults.workflow || {}),
      ...(entry.workflow || {})
    };
  }
  return effective;
}

function readManifestSkills(maestroRoot) {
  const manifest = readManifestDocument(maestroRoot);
  return Object.fromEntries(
    Object.entries(manifest.skills || {}).map(([id, entry]) => [id, applyManifestDefaults(manifest, entry)])
  );
}

function listSkillDirectories(root) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => ({ id: entry.name, path: path.join(root, entry.name) }));
}

function toRecord({
  namespace,
  id,
  source,
  verification,
  skillPath,
  provider,
  description,
  manifestEntry
}) {
  const metadata = readSkillMetadata(skillPath, id);
  const contract = source === "maestro"
    ? createCanonicalSkillContract(id, manifestEntry || {})
    : projectLegacySkill({
        id,
        entry: manifestEntry || {},
        namespace,
        source,
        verification,
        description: description || metadata.description,
        provider
      });

  return Object.freeze({
    identity: `${namespace}/${id}`,
    namespace,
    id,
    displayName: metadata.name,
    description: contract.description,
    source,
    verification,
    provider,
    path: skillPath,
    schemaVersion: contract.schemaVersion,
    origin: contract.origin,
    maturity: contract.maturity,
    contract
  });
}

class SkillRegistry {
  constructor(options = {}) {
    this.maestroRoot = options.maestroRoot || path.resolve(__dirname, "../..");
    this.userHome = options.userHome || os.homedir();
    this.projectRoot = options.projectRoot || process.cwd();
    this.useDefaultDiscovery = !Object.prototype.hasOwnProperty.call(options, "userSources");
    this.userSources = options.userSources || [
      { provider: "codex", path: path.join(this.userHome, ".codex", "skills") },
      { provider: "claude", path: path.join(this.userHome, ".claude", "skills") },
      { provider: "opencode", path: path.join(this.userHome, ".opencode", "skills") },
      { provider: "gemini", path: path.join(this.userHome, ".gemini", "skills") }
    ];
    this.projectSources = options.projectSources || [
      path.join(this.projectRoot, ".orquestrador-maestro", "skills"),
      path.join(this.projectRoot, ".orquestrador", "skills"),
      path.join(this.projectRoot, ".codex", "skills"),
      path.join(this.projectRoot, ".claude", "skills")
    ];
  }

  list() {
    const records = this.useDefaultDiscovery
      ? [...this.listDiscovered(), ...this.listProject()]
      : [...this.listMaestro(), ...this.listUser(), ...this.listProject()];
    const key = this.useDefaultDiscovery ? (record) => record.id : (record) => record.identity;
    return Object.freeze([...new Map(records.map((record) => [key(record), record])).values()]
      .sort((left, right) => left.identity.localeCompare(right.identity)));
  }

  get(identityOrId) {
    const key = typeof identityOrId === "string" ? identityOrId.trim() : "";
    if (!key) return null;
    const skills = this.list();
    const exact = skills.find((skill) => skill.identity === key);
    if (exact) return exact;

    // Planner/IntentRouter contracts use canonical skill ids, while external
    // callers may use fully-qualified identities. Resolve the short id only
    // when the effective registry has a single winner; ambiguous custom
    // registries must use the namespaced identity explicitly.
    const byId = skills.filter((skill) => skill.id === key);
    return byId.length === 1 ? byId[0] : null;
  }

  listMaestro() {
    const manifestSkills = readManifestSkills(this.maestroRoot);
    return Object.entries(manifestSkills).map(([id, entry]) => {
      const repositorySkillPath = path.join(this.maestroRoot, "orquestrador", "skills", id);
      const installedSkillPath = path.join(this.maestroRoot, "skills", id);
      return toRecord({
        namespace: "maestro",
        id,
        source: "maestro",
        verification: "maestro_verified",
        skillPath: isDirectory(repositorySkillPath) ? repositorySkillPath : installedSkillPath,
        description: entry.description,
        manifestEntry: entry
      });
    });
  }

  listUser() {
    if (this.useDefaultDiscovery) {
      return this.listDiscovered();
    }
    return this.userSources.flatMap((source) => listSkillDirectories(source.path).map((skill) => toRecord({
      namespace: `user/${source.provider}`,
      id: skill.id,
      source: "user",
      verification: "unverified",
      provider: source.provider,
      skillPath: skill.path
    })));
  }

  listDiscovered() {
    const manifestSkills = readManifestSkills(this.maestroRoot);
    return discoverSkills({ userHome: this.userHome, maestroRoot: this.maestroRoot, includeUserSources: true }).skills.map((skill) => toRecord({
      namespace: skill.namespace,
      id: skill.id,
      source: skill.source,
      verification: skill.source === "maestro" ? "maestro_verified" : skill.source === "library" ? "public_catalog" : "unverified",
      provider: skill.provider,
      skillPath: skill.path,
      description: skill.description,
      manifestEntry: skill.source === "maestro" ? manifestSkills[skill.id] : undefined
    }));
  }

  listProject() {
    return this.projectSources.flatMap((sourcePath) => listSkillDirectories(sourcePath).map((skill) => toRecord({
      namespace: "project",
      id: skill.id,
      source: "project",
      verification: "unverified",
      skillPath: skill.path
    })));
  }
}

module.exports = {
  SkillRegistry,
  listSkillDirectories,
  applyManifestDefaults,
  readManifestDocument,
  readManifestSkills,
  resolveManifestPath
};
