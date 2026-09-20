"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveMaestroRoot } = require("../config/maestro-paths");
const { discoverSkills } = require("../skills/discovery");

/**
 * IntentRouter — Resolve a intenção do usuário para skills concretas
 * usando SKILL_ALIASES, SKILLS_ROUTER e SKILL_CHAINS.
 *
 * Não pergunta nada. Apenas classifica.
 */
class IntentRouter {
  constructor({ maestroRoot, userHome } = {}) {
    this.maestroRoot = maestroRoot || resolveMaestroRoot();
    this.userHome = userHome || os.homedir();
    this._aliases = null;
    this._router = null;
    this._chains = null;
    this._profiles = null;
    this._discoveredSkills = null;
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

  get discoveredSkills() {
    if (!this._discoveredSkills) {
      this._discoveredSkills = discoverSkills({
        userHome: this.userHome,
        maestroRoot: this.maestroRoot,
        includeUserSources: true
      }).skills.reduce((result, skill) => {
        // Explicit /skill:<id> invocation is deterministic even when two
        // providers expose the same directory name. Prefer the first source
        // selected by discovery priority and keep the path available to the
        // caller that loads the skill body.
        if (!result[skill.id]) {
          result[skill.id] = {
            id: skill.id,
            description: skill.description || `Skill descoberta em ${skill.source}.`,
            triggers: [],
            aliases: [],
            source: skill.source,
            provider: skill.provider,
            path: skill.path,
            priority: -1
          };
        }
        return result;
      }, {});
    }
    return this._discoveredSkills;
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
    const rawDescription = String(description || "").trim();
    const lowerDesc = rawDescription.toLocaleLowerCase("pt-BR");
    const matchedSkills = new Map(); // skillId -> evidence
    const engineeringCapabilities = [];
    const capabilitySkillIds = new Set();

    const addEvidence = (skillId, evidence) => {
      const current = matchedSkills.get(skillId) || { evidence: [] };
      current.evidence.push(evidence);
      matchedSkills.set(skillId, current);
    };

    const skillIds = new Set([
      ...Object.keys(this.router.skills || {}),
      ...Object.keys(this.router.librarySkills || {}),
      ...Object.keys(this.discoveredSkills)
    ]);

    // Explicit canonical invocation always wins (for example /skill:skill-x).
    for (const skillId of skillIds) {
      const isDiscoveredOnly = !this.router.skills?.[skillId] &&
        !this.router.librarySkills?.[skillId] &&
        Boolean(this.discoveredSkills[skillId]);
      const explicit = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:/)?skill:${skillId}(?:$|[^\\p{L}\\p{N}])`, "iu").test(rawDescription);
      const bareCanonical = !isDiscoveredOnly && new RegExp(`(?:^|[^\\p{L}\\p{N}])${skillId}(?:$|[^\\p{L}\\p{N}])`, "iu").test(rawDescription);
      if (explicit || bareCanonical) {
        addEvidence(skillId, {
          kind: "canonical",
          value: skillId,
          tier: 6,
          specificity: skillId.length,
          priority: Number(this.router.skills?.[skillId]?.priority || this.router.librarySkills?.[skillId]?.priority || 0)
        });
      }
    }

    // 1. Alias matching. Exact means the complete user wording is the alias;
    // contained aliases are intentionally weaker so short words do not win.
    for (const [alias, skillId] of Object.entries(this.aliases)) {
      const normalizedAlias = String(alias).trim().toLocaleLowerCase("pt-BR");
      if (!normalizedAlias) continue;
      const genericAlias = new Set(["saas", "ia", "ai", "llm", "ux", "admin", "dashboard", "whatsapp"])
        .has(normalizedAlias);
      const containedTier = genericAlias ? 1 : 3;
      if (lowerDesc === normalizedAlias) {
        addEvidence(skillId, { kind: "alias-exact", value: alias, tier: 5, specificity: normalizedAlias.length, priority: 0 });
      } else if (this._phraseMatches(lowerDesc, normalizedAlias)) {
        addEvidence(skillId, { kind: "alias-contained", value: alias, tier: containedTier, specificity: normalizedAlias.length, priority: 0 });
      }
    }

    // 2. Trigger matching. Complete trigger wording outranks contained terms.
    for (const [skillId, skill] of Object.entries(this.router.skills || {})) {
      for (const trigger of skill.triggers || []) {
        const normalizedTrigger = String(trigger).trim().toLocaleLowerCase("pt-BR");
        if (!normalizedTrigger) continue;
        const priority = Number(skill.priority || 0);
        if (lowerDesc === normalizedTrigger) {
          addEvidence(skillId, { kind: "trigger-exact", value: trigger, tier: 4, specificity: normalizedTrigger.length, priority });
        } else if (this._phraseMatches(lowerDesc, normalizedTrigger)) {
          addEvidence(skillId, { kind: "trigger-contained", value: trigger, tier: 2, specificity: normalizedTrigger.length, priority });
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
        addEvidence(skillId, { kind: "capability", value: capability, tier: 1, specificity: capability.length, priority: Number(route.priority || 0) });
      }
    }

    // 3. Rank by the strongest evidence, then specificity, declared priority,
    // and lexical id. This is deterministic and avoids accumulated keyword noise.
    const summarize = (details) => {
      const evidence = [...details.evidence].sort((a, b) =>
        b.tier - a.tier || b.specificity - a.specificity || b.priority - a.priority || a.value.localeCompare(b.value, "pt-BR")
      );
      const strongest = evidence[0] || { tier: 0, specificity: 0, priority: 0 };
      return {
        score: strongest.tier * 100000 + strongest.specificity * 100 + strongest.priority,
        tier: strongest.tier,
        specificity: strongest.specificity,
        priority: strongest.priority,
        evidence
      };
    };
    const ranked = [...matchedSkills.entries()]
      .map(([skillId, details]) => [skillId, summarize(details)])
      .sort((a, b) => b[1].tier - a[1].tier || b[1].specificity - a[1].specificity || b[1].priority - a[1].priority || a[0].localeCompare(b[0], "en"));

    const primarySkillId = ranked[0]?.[0] || null;
    const primarySkill = primarySkillId
      ? { id: primarySkillId, ...(this.router.skills?.[primarySkillId] || this.router.librarySkills?.[primarySkillId] || this.discoveredSkills[primarySkillId] || {}) }
      : null;

    const top = ranked[0]?.[1] || null;
    const ambiguities = top
      ? ranked.filter(([, details]) => details.tier === top.tier && details.specificity === top.specificity && details.priority === top.priority).map(([id]) => id)
      : [];

    // 4. Chain resolution — what secondary skills does the primary allow?
    const chainedSkills = [];
    if (primarySkillId && this.chains.chains?.[primarySkillId]) {
      const chain = this.chains.chains[primarySkillId];
      for (const allowedSkill of chain.mayInvoke || []) {
        // Only include if user's intent also matches it
        if (matchedSkills.has(allowedSkill)) {
          const details = summarize(matchedSkills.get(allowedSkill));
          chainedSkills.push({
            id: allowedSkill,
            ...(this.router.skills?.[allowedSkill] || this.router.librarySkills?.[allowedSkill] || this.discoveredSkills[allowedSkill] || {}),
            matchScore: details.score,
            matchedEvidence: details.evidence
          });
        }
      }
    }

    const guidedSkills = ranked
      .filter(([skillId]) => capabilitySkillIds.has(skillId) && skillId !== primarySkillId)
      .slice(0, 4)
      .map(([skillId, details]) => ({
        id: skillId,
        ...(this.router.skills?.[skillId] || this.router.librarySkills?.[skillId] || this.discoveredSkills[skillId] || {}),
        matchScore: details.score,
        matchedEvidence: details.evidence
      }));

    // 5. Select execution profile based on scope
    const totalSkills = 1 + chainedSkills.length;
    const profile = engineeringCapabilities.length > 0
      ? "guided-engineering"
      : totalSkills > 3 ? "deep" : totalSkills > 1 ? "standard" : "fast";

    // 6. Determine risk from primary skill
    const risk = primarySkill?.safety || "standard";
    const maxSkills = this.profiles.profiles?.[profile]?.maxSkills;
    const allSkills = [primarySkill, ...guidedSkills, ...chainedSkills]
      .filter(Boolean)
      .filter((skill, index, list) => list.findIndex((candidate) => candidate.id === skill.id) === index);

    return Object.freeze({
      primarySkill,
      chainedSkills,
      allSkills: Number.isInteger(maxSkills) ? allSkills.slice(0, maxSkills) : allSkills,
      guidedSkills: Object.freeze(guidedSkills),
      profile,
      risk,
      engineeringCapabilities: Object.freeze(engineeringCapabilities),
      routingVersion: 2,
      confidence: primarySkill ? (top.tier >= 4 ? "high" : top.tier >= 2 ? "medium" : "low") : "none",
      matchedEvidence: Object.freeze(top ? top.evidence : []),
      ambiguities: Object.freeze(ambiguities.length > 1 ? ambiguities : []),
      matchDetails: Object.fromEntries(ranked)
    });
  }
}

module.exports = { IntentRouter };
