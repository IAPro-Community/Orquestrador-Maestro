"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveMaestroRoot } = require("../config/maestro-paths");
const { SkillRegistry } = require("../skills/registry");
const { classifyComplexity } = require("./complexity-gate");

const FANOUT_ORCHESTRATION_SKILLS = new Set([
  "skill-multiagent-orchestration",
  "skill-aionui-cowork-orchestration"
]);

const GENERIC_ALIASES = new Set([
  "saas", "ia", "ai", "llm", "ux", "admin", "dashboard", "whatsapp", "design", "frontend"
]);

const ROUTING_STOPWORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "de", "da", "do", "das", "dos", "e", "ou", "para", "por", "com", "sem",
  "em", "no", "na", "nos", "nas", "que", "isso", "isto", "esse", "essa",
  "este", "esta", "ao", "aos", "à", "às", "se", "ser", "use", "usar"
]);

const EVIDENCE_WEIGHT = Object.freeze({
  explicit: 1000,
  "alias-exact": 900,
  "trigger-exact": 800,
  "alias-contained": 650,
  "trigger-contained": 600,
  capability: 400
});

const CAPABILITY_ROUTE_MAP = Object.freeze({
  "software-architecture": ["architecture"],
  "backend-engineering": ["engineering", "api-design"],
  "frontend-architecture": ["frontend", "architecture"],
  "frontend-excellence": ["frontend"],
  "code-semantics": ["engineering", "refactoring"],
  "data-modeling": ["database", "architecture"],
  "database-migrations": ["database"],
  "testing-strategy": ["testing"],
  "e2e-testing": ["testing"],
  security: ["security"]
});

const CONTEXT_COST_ESTIMATES = Object.freeze({
  minimal: 500,
  low: 1200,
  medium: 2500,
  high: 4000,
  unknown: 1500
});

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR");
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

function phraseMatches(text, phrase) {
  const normalizedText = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(
    "(?<![\\p{L}\\p{N}])" + escapeRegExp(normalizedPhrase) + "(?![\\p{L}\\p{N}])",
    "iu"
  ).test(normalizedText);
}

function tokenize(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .split(/[^a-z0-9]+/gu)
    .filter((token) => token.length >= 3 && !ROUTING_STOPWORDS.has(token));
}

function negativeRouteMatches(intent, phrase) {
  const text = normalizeText(intent);
  const negative = normalizeText(phrase);
  if (!negative) return false;
  if (text.includes(negative) || negative.includes(text)) return true;

  const left = new Set(tokenize(intent));
  const right = new Set(tokenize(phrase));
  if (left.size === 0 || right.size === 0) return false;

  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap >= 2 && overlap / Math.min(left.size, right.size) >= 0.67;
}

function strongestEvidence(evidence) {
  return [...evidence].sort((a, b) =>
    b.weight - a.weight ||
    b.specificity - a.specificity ||
    b.priority - a.priority ||
    String(a.value).localeCompare(String(b.value), "pt-BR")
  )[0] || null;
}

function routingSignalSummary(record, options = {}) {
  const capabilities = new Set(record?.contract?.capabilities || []);
  const stackMatches = (options.stackCapabilities || []).filter((capability) => capabilities.has(capability));
  const scopeMatches = (options.scopeCapabilities || []).filter((capability) => capabilities.has(capability));
  const memoryHint = (options.memorySkillHints || []).includes(record.id);
  const contextProvided = Array.isArray(options.availableContext);
  const availableContext = new Set(options.availableContext || []);
  const missingContext = contextProvided
    ? (record?.contract?.context?.required || []).filter((item) => !availableContext.has(item))
    : [];

  const bonus =
    stackMatches.length * 3000 +
    scopeMatches.length * 4000 +
    (memoryHint ? 5000 : 0) -
    missingContext.length * 250;

  return Object.freeze({
    bonus,
    stackMatches: Object.freeze([...stackMatches]),
    scopeMatches: Object.freeze([...scopeMatches]),
    memoryHint,
    missingContext: Object.freeze([...missingContext])
  });
}

function estimateContextTokens(records, budget) {
  const total = records.reduce((sum, record) => {
    const cost = record.contract?.costProfile?.context || "unknown";
    return sum + (CONTEXT_COST_ESTIMATES[cost] || CONTEXT_COST_ESTIMATES.unknown);
  }, 0);
  return Math.min(total, budget.maxContextTokens);
}

function publicSkill(record, routerDocument) {
  if (!record) return null;
  const route = routerDocument.skills?.[record.id] || routerDocument.librarySkills?.[record.id] || {};
  return Object.freeze({
    id: record.id,
    description: record.contract?.description || record.description || route.description || "",
    source: record.source,
    provider: record.provider,
    path: record.path,
    origin: record.contract?.origin,
    maturity: record.contract?.maturity,
    capabilities: record.contract?.capabilities || [],
    context: record.contract?.context || { required: [], useful: [], avoid: [] },
    outputs: record.contract?.outputs || [],
    costProfile: record.contract?.costProfile || { context: "unknown" },
    safety: route.safety || record.contract?.risk || "standard",
    priority: Number(route.priority || 0)
  });
}

class SkillRouterV3 {
  constructor({ maestroRoot, userHome, registry } = {}) {
    this.maestroRoot = maestroRoot || resolveMaestroRoot();
    this.userHome = userHome || os.homedir();
    this.registry = registry || new SkillRegistry({
      maestroRoot: this.maestroRoot,
      userHome: this.userHome
    });
    this._aliases = null;
    this._chains = null;
    this._routerDocument = null;
  }

  _loadJson(filename, fallback) {
    const filePath = path.join(this.maestroRoot, filename);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  get aliases() {
    if (!this._aliases) {
      const document = this._loadJson("SKILL_ALIASES.json", { aliases: {} });
      this._aliases = document.aliases || {};
    }
    return this._aliases;
  }

  get chains() {
    if (!this._chains) this._chains = this._loadJson("SKILL_CHAINS.json", { chains: {} });
    return this._chains;
  }

  get routerDocument() {
    if (!this._routerDocument) {
      this._routerDocument = this._loadJson("SKILLS_ROUTER.json", {
        skills: {},
        librarySkills: {},
        capabilityRoutes: {}
      });
    }
    return this._routerDocument;
  }

  resolve(intent, options = {}) {
    const rawIntent = String(intent || "").trim();
    const normalizedIntent = normalizeText(rawIntent);
    const complexity = classifyComplexity(rawIntent, options);
    const records = this.registry.list();
    const byId = new Map(records.map((record) => [record.id, record]));
    const evidenceById = new Map();
    const negativeById = new Map();
    const rejected = [];

    const addEvidence = (skillId, evidence) => {
      if (!byId.has(skillId)) return;
      const current = evidenceById.get(skillId) || [];
      current.push(Object.freeze(evidence));
      evidenceById.set(skillId, current);
    };

    for (const record of records) {
      const pattern = new RegExp(
        "(?:^|[^\\p{L}\\p{N}])(?:/)?skill:" + escapeRegExp(record.id) + "(?:$|[^\\p{L}\\p{N}])",
        "iu"
      );
      if (pattern.test(rawIntent)) {
        addEvidence(record.id, {
          kind: "explicit",
          value: record.id,
          weight: EVIDENCE_WEIGHT.explicit,
          specificity: record.id.length,
          priority: Number(this.routerDocument.skills?.[record.id]?.priority || 0)
        });
      }
    }

    for (const [alias, skillId] of Object.entries(this.aliases)) {
      const record = byId.get(skillId);
      if (!record) continue;
      const normalizedAlias = normalizeText(alias);
      const canonical = ["maestro-core", "maestro-domain"].includes(record.contract?.origin);

      if (normalizedIntent === normalizedAlias) {
        addEvidence(skillId, {
          kind: "alias-exact",
          value: alias,
          weight: EVIDENCE_WEIGHT["alias-exact"],
          specificity: normalizedAlias.length,
          priority: Number(this.routerDocument.skills?.[skillId]?.priority || 0)
        });
      } else if (
        canonical &&
        !GENERIC_ALIASES.has(normalizedAlias) &&
        normalizedAlias.length >= 4 &&
        phraseMatches(normalizedIntent, normalizedAlias)
      ) {
        addEvidence(skillId, {
          kind: "alias-contained",
          value: alias,
          weight: EVIDENCE_WEIGHT["alias-contained"],
          specificity: normalizedAlias.length,
          priority: Number(this.routerDocument.skills?.[skillId]?.priority || 0)
        });
      }
    }

    for (const record of records) {
      const contract = record.contract;
      if (!contract || !["maestro-core", "maestro-domain"].includes(contract.origin)) continue;
      if (contract.maturity === "deprecated") continue;

      for (const negative of contract.routing?.doNotUseWhen || []) {
        if (negativeRouteMatches(rawIntent, negative)) {
          const matches = negativeById.get(record.id) || [];
          matches.push(negative);
          negativeById.set(record.id, matches);
        }
      }

      for (const trigger of contract.routing?.useWhen || []) {
        const normalizedTrigger = normalizeText(trigger);
        if (!normalizedTrigger) continue;
        if (normalizedIntent === normalizedTrigger) {
          addEvidence(record.id, {
            kind: "trigger-exact",
            value: trigger,
            weight: EVIDENCE_WEIGHT["trigger-exact"],
            specificity: normalizedTrigger.length,
            priority: Number(this.routerDocument.skills?.[record.id]?.priority || 0)
          });
        } else if (phraseMatches(normalizedIntent, normalizedTrigger)) {
          addEvidence(record.id, {
            kind: "trigger-contained",
            value: trigger,
            weight: EVIDENCE_WEIGHT["trigger-contained"],
            specificity: normalizedTrigger.length,
            priority: Number(this.routerDocument.skills?.[record.id]?.priority || 0)
          });
        }
      }
    }

    for (const [routeId, route] of Object.entries(this.routerDocument.capabilityRoutes || {})) {
      const matched = (route.triggers || []).find((trigger) => phraseMatches(normalizedIntent, trigger));
      if (!matched) continue;
      const requiredCapabilities = CAPABILITY_ROUTE_MAP[routeId] || [];
      for (const skillId of route.skills || []) {
        const record = byId.get(skillId);
        if (!record || !["maestro-core", "maestro-domain"].includes(record.contract?.origin)) continue;
        if (requiredCapabilities.length > 0
          && !record.contract.capabilities.some((capability) => requiredCapabilities.includes(capability))) {
          rejected.push(Object.freeze({
            id: skillId,
            reason: "capability-mismatch",
            evidence: Object.freeze([routeId])
          }));
          continue;
        }
        addEvidence(skillId, {
          kind: "capability",
          value: routeId,
          weight: EVIDENCE_WEIGHT.capability,
          specificity: String(matched).length,
          priority: Number(route.priority || this.routerDocument.skills?.[skillId]?.priority || 0)
        });
      }
    }

    const candidates = [];

    for (const [skillId, negatives] of negativeById.entries()) {
      if (!evidenceById.has(skillId)) {
        rejected.push(Object.freeze({
          id: skillId,
          reason: "negative-routing",
          evidence: Object.freeze([...negatives])
        }));
      }
    }

    for (const [skillId, evidence] of evidenceById.entries()) {
      const record = byId.get(skillId);
      const strongest = strongestEvidence(evidence);
      const explicit = evidence.some((item) => item.kind === "explicit" || item.kind === "alias-exact");
      const negatives = negativeById.get(skillId) || [];

      if (FANOUT_ORCHESTRATION_SKILLS.has(skillId) && !complexity.budget.allowSubagents) {
        rejected.push(Object.freeze({
          id: skillId,
          reason: "complexity-no-fanout",
          evidence: Object.freeze([...evidence])
        }));
        continue;
      }

      if (!explicit && negatives.length > 0) {
        rejected.push(Object.freeze({
          id: skillId,
          reason: "negative-routing",
          evidence: Object.freeze([...negatives])
        }));
        continue;
      }

      const signals = routingSignalSummary(record, options);
      candidates.push({
        id: skillId,
        record,
        evidence: Object.freeze([...evidence]),
        strongest,
        signals,
        score: strongest.weight * 100000 + strongest.specificity * 100 + strongest.priority + signals.bonus
      });
    }

    candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, "en"));
    const primary = candidates[0] || null;
    const selectedRecords = primary ? [primary.record] : [];
    const chained = [];

    if (primary && complexity.budget.maxSkills > 1) {
      const chain = this.chains.chains?.[primary.id];
      for (const allowedId of chain?.mayInvoke || []) {
        if (selectedRecords.length >= complexity.budget.maxSkills) break;
        const candidate = candidates.find((entry) => entry.id === allowedId);
        if (!candidate || selectedRecords.some((record) => record.id === candidate.id)) continue;
        selectedRecords.push(candidate.record);
        chained.push(candidate);
      }
    }

    const selectedIds = new Set(selectedRecords.map((record) => record.id));
    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id)) continue;
      rejected.push(Object.freeze({
        id: candidate.id,
        reason: selectedRecords.length >= complexity.budget.maxSkills ? "complexity-budget" : "lower-rank",
        evidence: candidate.evidence
      }));
    }

    const top = candidates[0] || null;
    const second = candidates[1] || null;
    const confidence = !top
      ? "none"
      : top.strongest.weight >= EVIDENCE_WEIGHT["alias-exact"]
        ? "high"
        : top.strongest.weight >= EVIDENCE_WEIGHT["trigger-contained"] && (!second || top.score > second.score)
          ? "medium"
          : "low";

    const primarySkill = primary ? publicSkill(primary.record, this.routerDocument) : null;
    const chainedSkills = chained.map((candidate) => publicSkill(candidate.record, this.routerDocument));
    const allSkills = selectedRecords.map((record) => publicSkill(record, this.routerDocument));

    return Object.freeze({
      routingVersion: 3,
      intent: primary ? primary.id.replace(/^skill-/u, "") : "generic",
      complexity,
      primarySkill,
      chainedSkills: Object.freeze(chainedSkills),
      allSkills: Object.freeze(allSkills),
      profile: complexity.profile,
      risk: primarySkill?.safety || "standard",
      confidence,
      estimatedContextTokens: estimateContextTokens(selectedRecords, complexity.budget),
      contextBudget: complexity.budget.maxContextTokens,
      matchedEvidence: Object.freeze(primary?.evidence || []),
      whySelected: Object.freeze(primary?.evidence || []),
      routingSignals: Object.freeze({
        changedFiles: Object.freeze([...(options.changedFiles || [])]),
        stack: Object.freeze([...(options.stack || [])]),
        stackCapabilities: Object.freeze([...(options.stackCapabilities || [])]),
        scopeCapabilities: Object.freeze([...(options.scopeCapabilities || [])]),
        memorySkillHints: Object.freeze([...(options.memorySkillHints || [])]),
        selected: primary?.signals || null
      }),
      rejected: Object.freeze(rejected)
    });
  }

  explain(intent, options = {}) {
    const result = this.resolve(intent, options);
    const lines = [
      "Intent: " + result.intent,
      "Complexity: " + result.complexity.level,
      "Profile: " + result.profile,
      "",
      "Selected: " + (result.primarySkill?.id || "none"),
      "Confidence: " + result.confidence,
      "Estimated context: " + result.estimatedContextTokens + " / " + result.contextBudget + " tokens"
    ];

    if (result.chainedSkills.length > 0) {
      lines.splice(5, 0, "Chained: " + result.chainedSkills.map((skill) => skill.id).join(", "));
    }

    if (result.whySelected.length > 0) {
      lines.push("", "Why selected:");
      for (const evidence of result.whySelected) lines.push("  - " + evidence.kind + ": " + evidence.value);
    }

    const selectedSignals = result.routingSignals?.selected;
    if (selectedSignals && (
      selectedSignals.stackMatches.length > 0 ||
      selectedSignals.scopeMatches.length > 0 ||
      selectedSignals.memoryHint ||
      selectedSignals.missingContext.length > 0
    )) {
      lines.push("", "Routing signals:");
      if (selectedSignals.stackMatches.length > 0) lines.push("  - stack: " + selectedSignals.stackMatches.join(", "));
      if (selectedSignals.scopeMatches.length > 0) lines.push("  - changed-files: " + selectedSignals.scopeMatches.join(", "));
      if (selectedSignals.memoryHint) lines.push("  - verified-memory: skill hint matched");
      if (selectedSignals.missingContext.length > 0) lines.push("  - missing-context: " + selectedSignals.missingContext.join(", "));
    }

    if (result.rejected.length > 0) {
      lines.push("", "Rejected:");
      for (const entry of result.rejected.slice(0, 8)) lines.push("  - " + entry.id + ": " + entry.reason);
    }

    return Object.freeze({ result, text: lines.join("\n") });
  }
}

module.exports = {
  CAPABILITY_ROUTE_MAP,
  FANOUT_ORCHESTRATION_SKILLS,
  CONTEXT_COST_ESTIMATES,
  EVIDENCE_WEIGHT,
  SkillRouterV3,
  negativeRouteMatches,
  normalizeText,
  phraseMatches,
  routingSignalSummary,
  tokenize
};
