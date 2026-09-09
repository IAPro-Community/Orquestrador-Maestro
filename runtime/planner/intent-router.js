"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * IntentRouter — Resolve a intenção do usuário para skills concretas
 * usando SKILL_ALIASES, SKILLS_ROUTER e SKILL_CHAINS.
 *
 * Não pergunta nada. Apenas classifica.
 */
class IntentRouter {
  constructor({ maestroRoot }) {
    this.maestroRoot = maestroRoot || path.join(require("os").homedir(), ".orquestrador");
    this._aliases = null;
    this._router = null;
    this._chains = null;
    this._profiles = null;
  }

  // Lazy-load config files
  _loadJson(filename) {
    const filePath = path.join(this.maestroRoot, filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  get aliases() {
    if (!this._aliases) {
      const document = this._loadJson("SKILL_ALIASES.json") || {};
      this._aliases = document.aliases || document;
    }
    return this._aliases;
  }

  get router() {
    if (!this._router) this._router = this._loadJson("SKILLS_ROUTER.json") || { skills: {} };
    return this._router;
  }

  get chains() {
    if (!this._chains) this._chains = this._loadJson("SKILL_CHAINS.json") || { chains: {} };
    return this._chains;
  }

  get profiles() {
    if (!this._profiles) this._profiles = this._loadJson("SKILL_EXECUTION_PROFILES.json") || { profiles: {} };
    return this._profiles;
  }

  _phraseMatches(text, phrase) {
    const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
  }

  /**
   * Resolve uma descrição de alto nível para uma lista de skills relevantes.
   *
   * @param {string} description — A intenção do usuário
   * @returns {{ primarySkill, chainedSkills, profile, triggers, risk }}
   */
  resolve(description) {
    const lowerDesc = description.toLowerCase();
    const matchedSkills = new Map(); // skillId -> { score, source }
    const engineeringCapabilities = [];
    const capabilitySkillIds = new Set();

    // 1. Alias matching (exact phrases)
    for (const [alias, skillId] of Object.entries(this.aliases)) {
      if (this._phraseMatches(lowerDesc, alias)) {
        const current = matchedSkills.get(skillId) || { score: 0, sources: [] };
        current.score += 3; // Aliases get high weight
        current.sources.push(`alias:"${alias}"`);
        matchedSkills.set(skillId, current);
      }
    }

    // 2. Router trigger matching (keyword phrases)
    for (const [skillId, skill] of Object.entries(this.router.skills || {})) {
      for (const trigger of skill.triggers || []) {
        if (this._phraseMatches(lowerDesc, trigger)) {
          const current = matchedSkills.get(skillId) || { score: 0, sources: [] };
          current.score += 2;
          current.sources.push(`trigger:"${trigger}"`);
          matchedSkills.set(skillId, current);
        }
      }
    }

    // Capability routing is deliberately separate from native skill triggers:
    // it lets a beginner express outcomes while keeping the loaded skill set small.
    for (const [capability, route] of Object.entries(this.router.capabilityRoutes || {})) {
      if (!(route.triggers || []).some((trigger) => this._phraseMatches(lowerDesc, trigger))) continue;
      engineeringCapabilities.push(capability);
      for (const skillId of route.skills || []) {
        capabilitySkillIds.add(skillId);
        const current = matchedSkills.get(skillId) || { score: 0, sources: [] };
        current.score += 1;
        current.sources.push(`capability:${capability}`);
        matchedSkills.set(skillId, current);
      }
    }

    // 3. Sort by score, pick primary
    const ranked = [...matchedSkills.entries()]
      .sort((a, b) => b[1].score - a[1].score);

    const primarySkillId = ranked[0]?.[0] || null;
    const primarySkill = primarySkillId
      ? { id: primarySkillId, ...(this.router.skills?.[primarySkillId] || this.router.librarySkills?.[primarySkillId] || {}) }
      : null;

    // 4. Chain resolution — what secondary skills does the primary allow?
    const chainedSkills = [];
    if (primarySkillId && this.chains.chains?.[primarySkillId]) {
      const chain = this.chains.chains[primarySkillId];
      for (const allowedSkill of chain.mayInvoke || []) {
        // Only include if user's intent also matches it
        if (matchedSkills.has(allowedSkill)) {
          chainedSkills.push({
            id: allowedSkill,
            ...(this.router.skills?.[allowedSkill] || this.router.librarySkills?.[allowedSkill] || {}),
            matchScore: matchedSkills.get(allowedSkill).score
          });
        }
      }
    }

    const guidedSkills = ranked
      .filter(([skillId]) => capabilitySkillIds.has(skillId) && skillId !== primarySkillId)
      .slice(0, 4)
      .map(([skillId, details]) => ({
        id: skillId,
        ...(this.router.skills?.[skillId] || this.router.librarySkills?.[skillId] || {}),
        matchScore: details.score
      }));

    // 5. Select execution profile based on scope
    const totalSkills = 1 + chainedSkills.length;
    const profile = engineeringCapabilities.length > 0
      ? "guided-engineering"
      : totalSkills > 3 ? "deep" : totalSkills > 1 ? "standard" : "fast";

    // 6. Determine risk from primary skill
    const risk = primarySkill?.safety || "standard";

    return Object.freeze({
      primarySkill,
      chainedSkills,
      allSkills: [primarySkill, ...guidedSkills, ...chainedSkills].filter(Boolean).filter((skill, index, list) => list.findIndex((candidate) => candidate.id === skill.id) === index),
      guidedSkills: Object.freeze(guidedSkills),
      profile,
      risk,
      engineeringCapabilities: Object.freeze(engineeringCapabilities),
      matchDetails: Object.fromEntries(ranked)
    });
  }
}

module.exports = { IntentRouter };
