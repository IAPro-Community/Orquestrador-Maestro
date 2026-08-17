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
    if (!this._aliases) this._aliases = this._loadJson("SKILL_ALIASES.json") || {};
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

  /**
   * Resolve uma descrição de alto nível para uma lista de skills relevantes.
   *
   * @param {string} description — A intenção do usuário
   * @returns {{ primarySkill, chainedSkills, profile, triggers, risk }}
   */
  resolve(description) {
    const lowerDesc = description.toLowerCase();
    const matchedSkills = new Map(); // skillId -> { score, source }

    // 1. Alias matching (exact phrases)
    for (const [alias, skillId] of Object.entries(this.aliases)) {
      if (lowerDesc.includes(alias.toLowerCase())) {
        const current = matchedSkills.get(skillId) || { score: 0, sources: [] };
        current.score += 3; // Aliases get high weight
        current.sources.push(`alias:"${alias}"`);
        matchedSkills.set(skillId, current);
      }
    }

    // 2. Router trigger matching (keyword phrases)
    for (const [skillId, skill] of Object.entries(this.router.skills || {})) {
      for (const trigger of skill.triggers || []) {
        if (lowerDesc.includes(trigger.toLowerCase())) {
          const current = matchedSkills.get(skillId) || { score: 0, sources: [] };
          current.score += 2;
          current.sources.push(`trigger:"${trigger}"`);
          matchedSkills.set(skillId, current);
        }
      }
    }

    // 3. Sort by score, pick primary
    const ranked = [...matchedSkills.entries()]
      .sort((a, b) => b[1].score - a[1].score);

    const primarySkillId = ranked[0]?.[0] || null;
    const primarySkill = primarySkillId
      ? { id: primarySkillId, ...(this.router.skills?.[primarySkillId] || {}) }
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
            ...(this.router.skills?.[allowedSkill] || {}),
            matchScore: matchedSkills.get(allowedSkill).score
          });
        }
      }
    }

    // 5. Select execution profile based on scope
    const totalSkills = 1 + chainedSkills.length;
    const profile = totalSkills > 3 ? "deep" : totalSkills > 1 ? "standard" : "fast";

    // 6. Determine risk from primary skill
    const risk = primarySkill?.safety || "standard";

    return Object.freeze({
      primarySkill,
      chainedSkills,
      allSkills: [primarySkill, ...chainedSkills].filter(Boolean),
      profile,
      risk,
      matchDetails: Object.fromEntries(ranked)
    });
  }
}

module.exports = { IntentRouter };
