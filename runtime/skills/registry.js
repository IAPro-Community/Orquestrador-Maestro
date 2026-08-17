"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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
    this.userSources = options.userSources || [
      { provider: "codex", path: path.join(this.userHome, ".codex", "skills") },
      { provider: "claude", path: path.join(this.userHome, ".claude", "skills") },
      { provider: "opencode", path: path.join(this.userHome, ".opencode", "skills") },
      { provider: "gemini", path: path.join(this.userHome, ".gemini", "skills") }
    ];
    this.projectSources = options.projectSources || [
      path.join(this.projectRoot, ".orquestrador", "skills"),
      path.join(this.projectRoot, ".codex", "skills"),
      path.join(this.projectRoot, ".claude", "skills")
    ];
  }

  list() {
    return Object.freeze([
      ...this.listMaestro(),
      ...this.listUser(),
      ...this.listProject()
    ].sort((left, right) => left.identity.localeCompare(right.identity)));
  }

  get(identity) {
    return this.list().find((skill) => skill.identity === identity) || null;
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
    return this.userSources.flatMap((source) => listSkillDirectories(source.path).map((skill) => toRecord({
      namespace: `user/${source.provider}`,
      id: skill.id,
      source: "user",
      verification: "unverified",
      provider: source.provider,
      skillPath: skill.path
    })));
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
