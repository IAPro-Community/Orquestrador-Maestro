"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { SkillRegistry } = require("../../skills/registry");

const CATEGORY_MAP = Object.freeze({
  Development: ["saas", "engineering"],
  Frontend: ["frontend"],
  Backend: ["integrations", "database", "architecture"],
  Security: ["payments", "security", "compliance"],
  Automation: ["ai", "orchestration", "automation"],
  Other: [
    "media", "marketing", "communication", "analytics", "testing", "quality",
    "observability", "governance", "workflow", "delivery", "maintenance", "verification",
    "operations", "documentation", "research", "review"
  ]
});

function normalizeCategory(raw) {
  if (!raw || typeof raw !== "string") return "Other";
  const key = raw.trim().toLowerCase();
  for (const [normalized, raws] of Object.entries(CATEGORY_MAP)) {
    if (raws.includes(key)) return normalized;
  }
  return "Other";
}

function readSkillMeta(skillPath, fallback = {}) {
  let meta = fallback;
  if (skillPath && fs.existsSync(skillPath)) {
    try {
      const candidate = JSON.parse(fs.readFileSync(skillPath, "utf8"));
      if (candidate && typeof candidate === "object") meta = { ...fallback, ...candidate };
    } catch {
      // construct/skill metadata not JSON; keep fallback
    }
  }
  return meta;
}

function normalizeSkills(registry = new SkillRegistry(), manifestPath) {
  const root = registry.maestroRoot || path.resolve(__dirname, "../../..");
  const manifestFile = manifestPath || path.join(root, "orquestrador", "SKILLS_MANIFEST.json");
  const manifest = {};
  if (fs.existsSync(manifestFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      Object.assign(manifest, parsed.skills || {});
    } catch {
      // ignore malformed manifest; registry records still surface
    }
  }

  const records = registry.list();
  const byId = new Map();
  const sourcePrio = { maestro: 0, user: 1, project: 2 };
  for (const record of records) {
    const existing = byId.get(record.id);
    if (existing && (sourcePrio[existing.source] ?? 3) <= (sourcePrio[record.source] ?? 3)) continue;
    byId.set(record.id, record);
  }

  return [...byId.values()].map((record) => {
    const metaById = manifest[record.id] || {};
    const meta = readSkillMeta(
      path.join(record.path, "SKILL.md"),
      { ...metaById, description: metaById.description || "" }
    );
    const rawCategory = meta.category || "";
    const description = meta.description || metaById.description || "";
    const triggers = Array.isArray(meta.triggers) ? meta.triggers : (Array.isArray(metaById.triggers) ? metaById.triggers : []);
    const aliases = Array.isArray(meta.aliases) ? meta.aliases : (Array.isArray(metaById.aliases) ? metaById.aliases : []);
    const risk = meta.risk || metaById.risk || "low";
    const status = meta.status || metaById.status || "active";
    const tags = Array.isArray(meta.tags) ? meta.tags : [];

    return Object.freeze({
      identity: record.identity,
      namespace: record.namespace,
      id: record.id,
      displayName: record.displayName,
      source: record.source,
      verification: record.verification,
      provider: record.provider,
      path: record.path,
      description,
      rawCategory: rawCategory || "",
      normalizedCategory: normalizeCategory(rawCategory),
      risk,
      triggers: Object.freeze(triggers.slice()),
      aliases: Object.freeze(aliases.slice()),
      status,
      tags: Object.freeze(tags.slice()),
      ...(meta.mirrorEverywhere !== undefined ? { mirrorEverywhere: meta.mirrorEverywhere } : {}),
      ...(meta.provenance !== undefined ? { provenance: meta.provenance } : {}),
      ...(meta.workflow !== undefined ? { workflow: meta.workflow } : {})
    });
  });
}

module.exports = { normalizeSkills, normalizeCategory, CATEGORY_MAP };
