"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { discoverSkills } = require("./discovery");

function isDirectory(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function readSkillName(skillPath, fallback) {
  const filePath = path.join(skillPath, "SKILL.md");
  if (!fs.existsSync(filePath)) return fallback;
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^name:\s*([^\r\n]+)$/mu);
  return match ? match[1].trim() : fallback;
}

function listSkillDirectories(root) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => ({ id: entry.name, path: path.join(root, entry.name) }));
}

function toRecord({ namespace, id, source, verification, skillPath, provider }) {
  return Object.freeze({
    identity: `${namespace}/${id}`,
    namespace,
    id,
    displayName: readSkillName(skillPath, id),
    source,
    verification,
    provider,
    path: skillPath
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
    const manifestPath = path.join(this.maestroRoot, "orquestrador", "SKILLS_MANIFEST.json");
    if (!fs.existsSync(manifestPath)) return [];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Object.keys(manifest.skills || {}).map((id) => toRecord({
      namespace: "maestro",
      id,
      source: "maestro",
      verification: "maestro_verified",
      skillPath: path.join(this.maestroRoot, "orquestrador", "skills", id)
    }));
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
    return discoverSkills({ userHome: this.userHome, maestroRoot: this.maestroRoot, includeUserSources: true }).skills.map((skill) => toRecord({
        namespace: skill.namespace,
        id: skill.id,
        source: skill.source,
        verification: skill.source === "maestro" ? "maestro_verified" : skill.source === "library" ? "public_catalog" : "unverified",
        provider: skill.provider,
        skillPath: skill.path
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

module.exports = { SkillRegistry, listSkillDirectories };
