"use strict";

const SKILL_CONTRACT_SCHEMA_VERSION = 2;

const SKILL_ORIGINS = Object.freeze([
  "maestro-core",
  "maestro-domain",
  "external",
  "project",
  "user"
]);

const SKILL_MATURITY = Object.freeze(["experimental", "stable", "deprecated"]);
const SKILL_RISKS = Object.freeze(["low", "medium", "high", "unknown"]);
const VERIFICATION_LEVELS = Object.freeze(["light", "standard", "strict", "unknown"]);
const CONTEXT_COSTS = Object.freeze(["minimal", "low", "medium", "high", "unknown"]);
const SKILL_CAPABILITIES = Object.freeze([
  "ai-integration",
  "analytics",
  "api-design",
  "architecture",
  "browser-automation",
  "build-tooling",
  "ci",
  "communication",
  "compliance",
  "containers",
  "database",
  "debugging",
  "delivery",
  "developer-environment",
  "documentation",
  "engineering",
  "frontend",
  "git",
  "governance",
  "integrations",
  "issue-resolution",
  "kubernetes",
  "legacy-modernization",
  "maintenance",
  "marketing",
  "media",
  "observability",
  "operations",
  "orchestration",
  "payments",
  "performance",
  "pull-request",
  "quality",
  "refactoring",
  "research",
  "saas",
  "security",
  "testing",
  "verification",
  "workflow"
]);

function uniqueStrings(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze([...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))]);
}

function normalizeComparable(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function normalizeId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id)) {
    throw new TypeError("skill contract id must be lowercase kebab-case with at most 64 characters");
  }
  return id;
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function strictStringArray(value, label) {
  const items = requireArray(value, label);
  const normalized = items.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new TypeError(`${label} entries must be non-empty strings`);
    }
    return item.trim();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} entries must be unique`);
  }
  return Object.freeze(normalized);
}

function strictEnumArray(value, allowed, label, { minItems = 0 } = {}) {
  const items = strictStringArray(value, label);
  if (items.length < minItems) {
    throw new TypeError(`${label} must contain at least ${minItems} item(s)`);
  }
  for (const item of items) {
    if (!allowed.includes(item)) {
      throw new TypeError(`${label} contains unsupported value ${item}`);
    }
  }
  return items;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`);
  return value;
}

function enumValue(value, allowed, label) {
  const candidate = String(value || "");
  if (!allowed.includes(candidate)) {
    throw new TypeError(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return candidate;
}

function nonEmpty(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new TypeError(`${label} must be a non-empty string`);
  return text;
}

function freezeObject(value) {
  return Object.freeze(value);
}

function inferExternalOrigin({ namespace, source } = {}) {
  if (namespace === "project" || source === "project") return "project";
  if (String(namespace || "").startsWith("user/") || source === "user") return "user";
  return "external";
}

function inferExternalMaturity(entry = {}, verification) {
  if (SKILL_MATURITY.includes(entry.maturity)) return entry.maturity;
  if (entry.status === "deprecated") return "deprecated";
  // Discovery/catalog membership is not verification. External skills remain
  // experimental unless they declare maturity explicitly.
  return "experimental";
}

function inferRisk(entry = {}) {
  return SKILL_RISKS.includes(entry.risk) ? entry.risk : "unknown";
}

function legacyContext(entry = {}) {
  const context = entry.context && typeof entry.context === "object" && !Array.isArray(entry.context)
    ? entry.context
    : {};
  return {
    required: context.required,
    useful: context.useful,
    avoid: context.avoid
  };
}

function legacyRouting(entry = {}) {
  const documentation = entry.documentation && typeof entry.documentation === "object"
    ? entry.documentation
    : {};
  const routing = entry.routing && typeof entry.routing === "object" && !Array.isArray(entry.routing)
    ? entry.routing
    : {};
  return {
    useWhen: routing.useWhen || entry.useWhen || entry.triggers || documentation.bestFor || [],
    doNotUseWhen: routing.doNotUseWhen || entry.doNotUseWhen || documentation.notFor || []
  };
}

function assertNoRoutingOverlap(useWhen, doNotUseWhen) {
  const positive = new Set(useWhen.map(normalizeComparable));
  const overlap = doNotUseWhen.filter((item) => positive.has(normalizeComparable(item)));
  if (overlap.length > 0) {
    throw new TypeError(`skill routing useWhen/doNotUseWhen overlap: ${overlap.join(", ")}`);
  }
}

function createSkillContract(input = {}) {
  const routing = requireObject(input.routing, "skill routing");
  const context = requireObject(input.context, "skill context");
  const verification = requireObject(input.verification, "skill verification");
  const costProfile = requireObject(input.costProfile, "skill costProfile");
  const compatibility = requireObject(input.compatibility, "skill compatibility");

  const useWhen = strictStringArray(routing.useWhen, "skill routing.useWhen");
  const doNotUseWhen = strictStringArray(routing.doNotUseWhen, "skill routing.doNotUseWhen");
  assertNoRoutingOverlap(useWhen, doNotUseWhen);

  const category = input.category === null
    ? null
    : nonEmpty(input.category, "skill contract category");

  return freezeObject({
    schemaVersion: SKILL_CONTRACT_SCHEMA_VERSION,
    id: normalizeId(input.id),
    version: nonEmpty(input.version, "skill contract version"),
    origin: enumValue(input.origin, SKILL_ORIGINS, "skill contract origin"),
    maturity: enumValue(input.maturity, SKILL_MATURITY, "skill contract maturity"),
    description: nonEmpty(input.description, "skill contract description"),
    category,
    risk: enumValue(input.risk, SKILL_RISKS, "skill contract risk"),
    capabilities: strictStringArray(input.capabilities, "skill capabilities"),
    routing: freezeObject({
      useWhen,
      doNotUseWhen
    }),
    context: freezeObject({
      required: strictStringArray(context.required, "skill context.required"),
      useful: strictStringArray(context.useful, "skill context.useful"),
      avoid: strictStringArray(context.avoid, "skill context.avoid")
    }),
    outputs: strictStringArray(input.outputs, "skill outputs"),
    verification: freezeObject({
      level: enumValue(verification.level, VERIFICATION_LEVELS, "skill verification level"),
      requirements: strictStringArray(verification.requirements, "skill verification.requirements")
    }),
    costProfile: freezeObject({
      context: enumValue(costProfile.context, CONTEXT_COSTS, "skill context cost")
    }),
    compatibility: freezeObject({
      legacyProjected: requireBoolean(compatibility.legacyProjected, "skill compatibility.legacyProjected")
    })
  });
}

function isNativeSkillContractEntry(entry = {}) {
  if (entry.schemaVersion !== SKILL_CONTRACT_SCHEMA_VERSION) return false;
  if (!(typeof entry.contractVersion === "string" && entry.contractVersion.trim())) return false;
  if (!(typeof entry.description === "string" && entry.description.trim())) return false;
  if (!(entry.category === null || (typeof entry.category === "string" && entry.category.trim()))) return false;
  if (!["maestro-core", "maestro-domain"].includes(entry.origin)) return false;
  if (!SKILL_MATURITY.includes(entry.maturity)) return false;
  if (!["low", "medium", "high"].includes(entry.risk)) return false;
  if (!Array.isArray(entry.capabilities) || entry.capabilities.length === 0) return false;
  if (!entry.capabilities.every((capability) => SKILL_CAPABILITIES.includes(capability))) return false;
  if (!Array.isArray(entry.outputs) || entry.outputs.length === 0) return false;
  if (!entry.routing || !Array.isArray(entry.routing.useWhen) || entry.routing.useWhen.length === 0 || !Array.isArray(entry.routing.doNotUseWhen)) return false;
  if (!entry.context || !Array.isArray(entry.context.required) || !Array.isArray(entry.context.useful) || !Array.isArray(entry.context.avoid)) return false;
  if (!entry.verification || !["light", "standard", "strict"].includes(entry.verification.level) || !Array.isArray(entry.verification.requirements) || entry.verification.requirements.length === 0) return false;
  if (!entry.costProfile || !["minimal", "low", "medium", "high"].includes(entry.costProfile.context)) return false;
  return true;
}

function createCanonicalSkillContract(id, entry = {}) {
  if (!isNativeSkillContractEntry(entry)) {
    throw new TypeError(`Maestro skill ${id} must implement Skill Contract V2 natively`);
  }
  return createSkillContract({
    id,
    version: entry.contractVersion,
    origin: entry.origin,
    maturity: entry.maturity,
    description: entry.description,
    category: entry.category,
    risk: entry.risk,
    capabilities: entry.capabilities,
    routing: entry.routing,
    context: entry.context,
    outputs: entry.outputs,
    verification: entry.verification,
    costProfile: entry.costProfile,
    compatibility: {
      legacyProjected: false
    }
  });
}

function projectLegacySkill({
  id,
  entry = {},
  namespace,
  source,
  verification,
  description,
  category
} = {}) {
  if (namespace === "maestro" || source === "maestro") {
    throw new TypeError(`Maestro skill ${id || "<unknown>"} cannot use legacy projection`);
  }

  const documentation = entry?.documentation || {};
  const legacy = legacyContext(entry);
  const routing = legacyRouting(entry);
  const externalUseWhen = uniqueStrings(routing.useWhen);
  const positiveRouting = new Set(externalUseWhen.map(normalizeComparable));
  const externalDoNotUseWhen = uniqueStrings(routing.doNotUseWhen)
    .filter((item) => !positiveRouting.has(normalizeComparable(item)));
  const externalCapabilities = uniqueStrings(entry.capabilities || [])
    .filter((capability) => SKILL_CAPABILITIES.includes(capability));
  const externalVerificationLevel = VERIFICATION_LEVELS.includes(entry.verification?.level)
    ? entry.verification.level
    : "unknown";
  const externalContextCost = CONTEXT_COSTS.includes(entry.costProfile?.context)
    ? entry.costProfile.context
    : "unknown";

  return createSkillContract({
    id,
    version: entry.contractVersion || entry.version || entry?.provenance?.version || "external",
    origin: inferExternalOrigin({ namespace, source }),
    maturity: inferExternalMaturity(entry, verification),
    description: entry.description || description || id,
    category: entry.category || category || null,
    risk: inferRisk(entry),
    capabilities: externalCapabilities,
    routing: {
      useWhen: externalUseWhen,
      doNotUseWhen: externalDoNotUseWhen
    },
    context: {
      required: uniqueStrings(legacy.required || []),
      useful: uniqueStrings(legacy.useful || []),
      avoid: uniqueStrings(legacy.avoid || [])
    },
    outputs: uniqueStrings(entry.outputs || []),
    verification: {
      level: externalVerificationLevel,
      requirements: uniqueStrings(entry.verification?.requirements || documentation.expectedEvidence || [])
    },
    costProfile: {
      context: externalContextCost
    },
    compatibility: {
      legacyProjected: true
    }
  });
}

module.exports = {
  CONTEXT_COSTS,
  SKILL_CAPABILITIES,
  SKILL_CONTRACT_SCHEMA_VERSION,
  SKILL_MATURITY,
  SKILL_ORIGINS,
  SKILL_RISKS,
  VERIFICATION_LEVELS,
  createCanonicalSkillContract,
  createSkillContract,
  inferExternalMaturity,
  inferExternalOrigin,
  isNativeSkillContractEntry,
  projectLegacySkill,
  strictEnumArray,
  strictStringArray,
  uniqueStrings
};
