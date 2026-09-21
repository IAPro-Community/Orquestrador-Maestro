#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const orchestratorRoot = path.join(repoRoot, "orquestrador");
const skillsRoot = path.join(orchestratorRoot, "skills");
const manifestPath = path.join(orchestratorRoot, "SKILLS_MANIFEST.json");
const manifestSchemaPath = path.join(orchestratorRoot, "SKILLS_MANIFEST_SCHEMA.json");
const usageSchemaPath = path.join(orchestratorRoot, "SKILL_USAGE_SCHEMA.json");
const routerPath = path.join(orchestratorRoot, "SKILLS_ROUTER.json");
const aliasesPath = path.join(orchestratorRoot, "SKILL_ALIASES.json");
const chainsPath = path.join(orchestratorRoot, "SKILL_CHAINS.json");
const profilesPath = path.join(orchestratorRoot, "SKILL_EXECUTION_PROFILES.json");
const recipesPath = path.join(orchestratorRoot, "SKILL_RECIPES.json");
const installPolicyPath = path.join(orchestratorRoot, "SKILL_INSTALL_POLICY.json");
const syncShellPath = path.join(orchestratorRoot, "sync-skills.sh");
const syncPowerShellPath = path.join(orchestratorRoot, "sync-skills.ps1");
const referenceRoot = path.join(repoRoot, "docs", "skills", "reference");
const compactCatalogPath = path.join(repoRoot, "docs", "skill-catalog.md");
const publicCatalogPath = path.join(repoRoot, "skill-library", "PUBLIC_SKILLS_MANIFEST.json");
const GENERATED_MARKER = "<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_RISKS = new Set(["low", "medium", "high"]);
const VALID_STATUSES = new Set(["canonical", "legacy", "experimental", "deprecated"]);
const VALID_WORKFLOW_KINDS = new Set(["task", "workflow", "reference"]);
const VALID_VALIDATION_LEVELS = new Set(["light", "standard", "strict"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "mirror-everywhere") {
      args.mirrorEverywhere = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    index++;
    if (key === "trigger" || key === "alias") {
      args[key] = args[key] || [];
      args[key].push(value);
    } else {
      args[key] = value;
    }
  }
  return args;
}

function normalizeSkillName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/^\/?skill:/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTrigger(trigger) {
  return String(trigger || "").trim().toLocaleLowerCase("pt-BR");
}

function assertSkillName(name) {
  if (!/^skill-[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(name)) {
    throw new Error(`Invalid skill name: ${name}. Use skill-<lowercase-hyphen-name>, max 64 chars.`);
  }
}

function unique(values) {
  return Array.from(new Set((values || []).map((value) => String(value).trim()).filter(Boolean)));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateString(value, label, issues, { allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    issues.push(`${label}: must be a string`);
    return false;
  }
  if (!allowEmpty && value.trim().length === 0) {
    issues.push(`${label}: must not be empty`);
    return false;
  }
  return true;
}

function validateBoolean(value, label, issues) {
  if (typeof value !== "boolean") issues.push(`${label}: must be a boolean`);
}

function validateEnum(value, allowed, label, issues) {
  if (!allowed.has(value)) {
    issues.push(`${label}: must be one of ${Array.from(allowed).join(", ")}`);
  }
}

function validateStringArray(value, label, issues, { minItems = 0 } = {}) {
  if (!Array.isArray(value)) {
    issues.push(`${label}: must be an array`);
    return;
  }
  if (value.length < minItems) {
    issues.push(`${label}: must contain at least ${minItems} item(s)`);
  }
  const normalized = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push(`${label}: entries must be non-empty strings`);
      continue;
    }
    normalized.push(item.trim());
  }
  if (new Set(normalized).size !== normalized.length) {
    issues.push(`${label}: entries must be unique`);
  }
}

function validateProvenance(value, label, issues) {
  if (!isPlainObject(value)) {
    issues.push(`${label}: must be an object`);
    return;
  }
  const allowedKeys = new Set(["evidence", "steward", "reviewedAt", "legacyCompatible", "notes", "upstream", "version", "license"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push(`${label}: unknown field ${key}`);
  }
  validateStringArray(value.evidence, `${label}.evidence`, issues, { minItems: 1 });
  validateString(value.steward, `${label}.steward`, issues);
  if (validateString(value.reviewedAt, `${label}.reviewedAt`, issues) && !ISO_DATE_RE.test(value.reviewedAt)) {
    issues.push(`${label}.reviewedAt: must use YYYY-MM-DD`);
  }
  if (Object.prototype.hasOwnProperty.call(value, "legacyCompatible")) {
    validateBoolean(value.legacyCompatible, `${label}.legacyCompatible`, issues);
  }
  if (Object.prototype.hasOwnProperty.call(value, "notes")) {
    validateString(value.notes, `${label}.notes`, issues);
  }
  for (const field of ["upstream", "version", "license"]) {
    if (Object.prototype.hasOwnProperty.call(value, field)) validateString(value[field], `${label}.${field}`, issues);
  }
}

function validateDocumentation(value, label, issues) {
  if (!isPlainObject(value)) {
    issues.push(`${label}: must be an object`);
    return;
  }
  const allowedKeys = new Set(["bestFor", "notFor", "examples", "prerequisites", "expectedEvidence"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push(`${label}: unknown field ${key}`);
  }
  for (const field of ["bestFor", "notFor", "examples", "prerequisites", "expectedEvidence"]) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      issues.push(`${label}: missing ${field}`);
    } else {
      validateStringArray(value[field], `${label}.${field}`, issues, { minItems: field === "notFor" || field === "prerequisites" ? 0 : 1 });
    }
  }
}

function validateWorkflow(value, label, issues) {
  if (!isPlainObject(value)) {
    issues.push(`${label}: must be an object`);
    return;
  }
  const allowedKeys = new Set(["entry", "kind", "validation", "referencesOptional", "legacyCompatible", "notes"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push(`${label}: unknown field ${key}`);
  }
  if (validateString(value.entry, `${label}.entry`, issues) && /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(value.entry)) {
    issues.push(`${label}.entry: must be a relative path`);
  }
  if (validateString(value.kind, `${label}.kind`, issues)) {
    validateEnum(value.kind, VALID_WORKFLOW_KINDS, `${label}.kind`, issues);
  }
  if (validateString(value.validation, `${label}.validation`, issues)) {
    validateEnum(value.validation, VALID_VALIDATION_LEVELS, `${label}.validation`, issues);
  }
  if (Object.prototype.hasOwnProperty.call(value, "referencesOptional")) {
    validateBoolean(value.referencesOptional, `${label}.referencesOptional`, issues);
  }
  if (Object.prototype.hasOwnProperty.call(value, "legacyCompatible")) {
    validateBoolean(value.legacyCompatible, `${label}.legacyCompatible`, issues);
  }
  if (Object.prototype.hasOwnProperty.call(value, "notes")) {
    validateString(value.notes, `${label}.notes`, issues);
  }
}

function validateManifestSchemaDocument(value, issues) {
  if (!isPlainObject(value)) {
    issues.push("manifest: document must be an object");
    return;
  }
  if (Object.prototype.hasOwnProperty.call(value, "schema")) {
    if (validateString(value.schema, "manifest.schema", issues) && value.schema !== "./SKILLS_MANIFEST_SCHEMA.json") {
      issues.push("manifest.schema: must point to ./SKILLS_MANIFEST_SCHEMA.json");
    }
    if (!fs.existsSync(manifestSchemaPath)) {
      issues.push("manifest.schema: target file does not exist");
    } else {
      try {
        readJson(manifestSchemaPath);
      } catch (error) {
        issues.push(`manifest.schema: ${error.message}`);
      }
    }
  }
  if (!Number.isInteger(value.version) || value.version < 1) {
    issues.push("manifest.version: must be an integer >= 1");
  }
  validateString(value.purpose, "manifest.purpose", issues);
  if (Object.prototype.hasOwnProperty.call(value, "defaults")) {
    if (!isPlainObject(value.defaults)) {
      issues.push("manifest.defaults: must be an object");
    } else {
      const allowedKeys = new Set(["provenance", "workflow"]);
      for (const key of Object.keys(value.defaults)) {
        if (!allowedKeys.has(key)) issues.push(`manifest.defaults: unknown field ${key}`);
      }
      if (Object.prototype.hasOwnProperty.call(value.defaults, "provenance")) {
        validateProvenance(value.defaults.provenance, "manifest.defaults.provenance", issues);
      }
      if (Object.prototype.hasOwnProperty.call(value.defaults, "workflow")) {
        validateWorkflow(value.defaults.workflow, "manifest.defaults.workflow", issues);
      }
    }
  }
  if (!isPlainObject(value.skills)) {
    issues.push("manifest.skills: must be an object");
  }
}

function validateManifestSchemaFile(value, issues) {
  if (!isPlainObject(value)) {
    issues.push("SKILLS_MANIFEST_SCHEMA.json: document must be an object");
    return;
  }
  for (const field of ["$schema", "$id", "title", "type", "properties", "$defs"]) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      issues.push(`SKILLS_MANIFEST_SCHEMA.json: missing ${field}`);
    }
  }
  if (value.type !== "object") issues.push("SKILLS_MANIFEST_SCHEMA.json: type must be object");
  if (!Array.isArray(value.required) || !value.required.includes("skills")) {
    issues.push("SKILLS_MANIFEST_SCHEMA.json: required must include skills");
  }
}

function validateUsageSchemaDocument(value, issues) {
  if (!isPlainObject(value)) {
    issues.push("usageSchema: document must be an object");
    return;
  }
  if (!Number.isInteger(value.version) || value.version < 1) {
    issues.push("usageSchema.version: must be an integer >= 1");
  }
  validateString(value.logPath, "usageSchema.logPath", issues);
  validateString(value.purpose, "usageSchema.purpose", issues);
  validateStringArray(value.requiredFields, "usageSchema.requiredFields", issues, { minItems: 1 });
  if (Object.prototype.hasOwnProperty.call(value, "optionalFields")) {
    validateStringArray(value.optionalFields, "usageSchema.optionalFields", issues);
  }
  if (!isPlainObject(value.example)) {
    issues.push("usageSchema.example: must be an object");
  }
  if (Object.prototype.hasOwnProperty.call(value, "fieldSchemas")) {
    if (!isPlainObject(value.fieldSchemas)) {
      issues.push("usageSchema.fieldSchemas: must be an object");
    } else {
      const allowedKeys = new Set(["workflow", "provenance"]);
      for (const key of Object.keys(value.fieldSchemas)) {
        if (!allowedKeys.has(key)) issues.push(`usageSchema.fieldSchemas: unknown field ${key}`);
      }
      if (Object.prototype.hasOwnProperty.call(value.fieldSchemas, "workflow")) {
        validateWorkflow(value.fieldSchemas.workflow, "usageSchema.fieldSchemas.workflow", issues);
      }
      if (Object.prototype.hasOwnProperty.call(value.fieldSchemas, "provenance")) {
        validateProvenance(value.fieldSchemas.provenance, "usageSchema.fieldSchemas.provenance", issues);
      }
    }
  }
  if (isPlainObject(value.example)) {
    for (const field of value.requiredFields || []) {
      if (!Object.prototype.hasOwnProperty.call(value.example, field)) {
        issues.push(`usageSchema.example: missing required field ${field}`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(value.example, "workflow")) {
      validateWorkflow(value.example.workflow, "usageSchema.example.workflow", issues);
    }
    if (Object.prototype.hasOwnProperty.call(value.example, "provenance")) {
      validateProvenance(value.example.provenance, "usageSchema.example.provenance", issues);
    }
  }
}

function readFrontmatter(skillFile) {
  const text = fs.readFileSync(skillFile, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    result[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
  }
  return result;
}

function createSkill(args) {
  const name = normalizeSkillName(args.name);
  assertSkillName(name);

  const description = String(args.description || "").trim();
  const category = String(args.category || "").trim();
  const risk = String(args.risk || "").trim();
  const source = String(args.source || "local-patterns").trim();
  const triggers = unique(args.trigger);
  const aliases = unique(args.alias);

  if (!description || !category || !risk) {
    throw new Error("--description, --category, and --risk are required.");
  }
  if (triggers.length === 0) {
    throw new Error("At least one --trigger is required.");
  }

  const skillDir = path.join(skillsRoot, name);
  const skillFile = path.join(skillDir, "SKILL.md");
  if (fs.existsSync(skillFile)) {
    throw new Error(`Skill already exists: ${skillFile}`);
  }

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    skillFile,
    `---\nname: ${name}\ndescription: ${description}\ncategory: ${category}\nrisk: ${risk}\nsource: ${source}\n---\n\n# ${name}\n\n## Core Workflow\n\n1. Identify the project context, existing patterns, and the smallest useful scope.\n2. Apply this skill only when the request matches its description or router triggers.\n3. Keep implementation details local to the target project and avoid exposing secrets or private data.\n4. Verify with the lightest meaningful command or inspection for the risk level.\n\n## Guardrails\n\n- Keep this skill compact; move long details into \`references/\` and link them from this file.\n- Do not include tokens, local paths, logs, private project names, or stale API examples.\n- Prefer project evidence over generic assumptions.\n\n## Verification\n\n- Confirm the requested behavior or decision is covered by local evidence.\n- Run the relevant project validation gate when code, config, or operational behavior changes.\n\n## Related Skills\n\n- None yet.\n`,
    "utf8"
  );

  const manifest = fs.existsSync(manifestPath)
    ? readJson(manifestPath)
    : {
        version: 1,
        schema: "./SKILLS_MANIFEST_SCHEMA.json",
        purpose: "Canonical Orquestrador skill registry.",
        skills: {},
      };
  const reviewedAt = new Date().toISOString().slice(0, 10);
  manifest.skills[name] = {
    description,
    category,
    risk,
    source,
    mirrorEverywhere: Boolean(args.mirrorEverywhere),
    triggers,
    aliases,
    status: "canonical",
    tags: unique([category, ...name.replace(/^skill-/, "").split("-")]),
    routerSummary: description,
    documentation: {
      bestFor: [description],
      notFor: [`Pedidos fora do domínio ${category}; use uma skill mais específica.`],
      examples: triggers.slice(0, 5).map((trigger) => `Use para ${trigger}.`),
      prerequisites: [`Contexto do projeto e autorização compatíveis com o risco ${risk}.`],
      expectedEvidence: ["Resultado solicitado demonstrado por teste, inspeção ou artefato verificável."],
    },
    provenance: {
      evidence: [`orquestrador/skills/${name}/SKILL.md`],
      steward: "orquestrador-maintainers",
      reviewedAt,
      upstream: source,
      version: "bundled",
      license: "repository-license",
      legacyCompatible: true,
      notes: "Metadados gerados pelo catálogo canônico.",
    },
  };
  writeJson(manifestPath, manifest);

  console.log(`Created ${path.relative(repoRoot, skillFile)}`);
  generate();
}

function readOptionalJson(file, fallback) {
  return fs.existsSync(file) ? readJson(file) : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function markdownCell(value) {
  return String(value || "").replace(/[|\r\n]+/g, " ").trim();
}

function effectiveDocumentation(entry) {
  const documentation = isPlainObject(entry.documentation) ? entry.documentation : {};
  return {
    bestFor: list(documentation.bestFor).length > 0 ? list(documentation.bestFor) : [entry.description],
    notFor: list(documentation.notFor),
    examples: list(documentation.examples).length > 0 ? list(documentation.examples) : list(entry.triggers).slice(0, 5).map((trigger) => `Use para ${trigger}.`),
    prerequisites: list(documentation.prerequisites),
    expectedEvidence: list(documentation.expectedEvidence).length > 0
      ? list(documentation.expectedEvidence)
      : ["Resultado solicitado demonstrado por teste, inspeção ou artefato verificável."],
  };
}

function effectiveProvenance(manifest, entry) {
  const defaults = isPlainObject(manifest.defaults?.provenance) ? manifest.defaults.provenance : {};
  const provenance = isPlainObject(entry.provenance) ? entry.provenance : {};
  return {
    evidence: list(provenance.evidence).length > 0 ? list(provenance.evidence) : list(defaults.evidence),
    steward: provenance.steward || defaults.steward || "orquestrador-maintainers",
    reviewedAt: provenance.reviewedAt || defaults.reviewedAt || "não informado",
    upstream: provenance.upstream || entry.source || defaults.upstream || "local",
    version: provenance.version || defaults.version || "bundled",
    license: provenance.license || defaults.license || "repository-license",
  };
}

function effectiveTags(name, entry) {
  const tags = list(entry.tags);
  if (tags.length > 0) return tags;
  const derived = name.replace(/^skill-/, "").split("-").filter(Boolean);
  return unique([entry.category, ...derived]);
}

function effectiveWorkflow(manifest, entry) {
  return isPlainObject(entry.workflow) ? entry.workflow : (isPlainObject(manifest.defaults?.workflow) ? manifest.defaults.workflow : null);
}

function relatedChains(name, chains) {
  return Object.entries(chains.chains || {})
    .filter(([owner, chain]) => owner === name || list(chain?.mayInvoke).includes(name))
    .map(([owner]) => owner)
    .sort((left, right) => left.localeCompare(right));
}

function recipeEntries(recipes) {
  if (Array.isArray(recipes)) return recipes.map((recipe, index) => [recipe.id || `recipe-${index + 1}`, recipe]);
  if (Array.isArray(recipes.recipes)) return recipes.recipes.map((recipe, index) => [recipe.id || `recipe-${index + 1}`, recipe]);
  if (isPlainObject(recipes.recipes)) return Object.entries(recipes.recipes);
  return Object.entries(recipes).filter(([key]) => key !== "version" && key !== "purpose");
}

function relatedRecipes(name, recipes) {
  return recipeEntries(recipes)
    .filter(([, recipe]) => isPlainObject(recipe) && (recipe.primarySkill === name || list(recipe.supportingSkills).includes(name)))
    .map(([id, recipe]) => ({ id, title: recipe.title || id }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function validateRecipes(recipes, manifestSkills, profiles, chains, issues) {
  if (!fs.existsSync(recipesPath)) return;
  if (!isPlainObject(recipes) || !Number.isInteger(recipes.version) || recipes.version < 1) {
    issues.push("recipes: document must declare an integer version");
    return;
  }
  const entries = recipeEntries(recipes);
  const ids = new Set();
  for (const [id, recipe] of entries) {
    if (ids.has(id)) issues.push(`recipes:${id}: duplicate id`);
    ids.add(id);
    if (!isPlainObject(recipe)) {
      issues.push(`recipes:${id}: must be an object`);
      continue;
    }
    for (const field of ["title", "goal", "primarySkill", "executionProfile", "risk"]) {
      if (typeof recipe[field] !== "string" || recipe[field].trim().length === 0) issues.push(`recipes:${id}: missing ${field}`);
    }
    const referencedSkills = unique([recipe.primarySkill, ...list(recipe.supportingSkills), ...list(recipe.sequence)]);
    for (const skill of referencedSkills) {
      if (!manifestSkills[skill]) issues.push(`recipes:${id}: references missing skill ${skill}`);
    }
    if (recipe.executionProfile && !profiles.profiles?.[recipe.executionProfile]) {
      issues.push(`recipes:${id}: references missing execution profile ${recipe.executionProfile}`);
    }
    for (const chain of list(recipe.chains)) {
      if (!chains.chains?.[chain]) issues.push(`recipes:${id}: references missing chain ${chain}`);
    }
    if (recipe.risk) validateEnum(recipe.risk, VALID_RISKS, `recipes:${id}.risk`, issues);
    for (const field of ["supportingSkills", "sequence", "requiredEvidence", "whenToUse", "whenNotToUse"]) {
      if (Object.prototype.hasOwnProperty.call(recipe, field)) validateStringArray(recipe[field], `recipes:${id}.${field}`, issues);
    }
  }
}

function availabilityFor(entry, policy) {
  const targets = Object.entries(policy.nativeRoots || {}).sort(([left], [right]) => left.localeCompare(right));
  return {
    label: entry.mirrorEverywhere ? "Nativa" : "Sob demanda",
    targets,
  };
}

function renderList(values) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- Nenhuma declarada.";
}

function renderSkillPage(name, entry, context) {
  const docs = effectiveDocumentation(entry);
  const provenance = effectiveProvenance(context.manifest, entry);
  const workflow = effectiveWorkflow(context.manifest, entry);
  const availability = availabilityFor(entry, context.policy);
  const tags = effectiveTags(name, entry);
  const aliases = list(entry.aliases);
  const chains = relatedChains(name, context.chains);
  const recipes = relatedRecipes(name, context.recipes);
  const sourcePath = `../../../orquestrador/skills/${name}/SKILL.md`;
  const compatibility = availability.targets.length > 0
    ? availability.targets.map(([target, config]) => `| ${markdownCell(target)} | ${availability.label} | ${markdownCell(config.path)} |`).join("\n")
    : "| Maestro | Sob demanda | Biblioteca canônica |";

  return `${GENERATED_MARKER}
# ${name}

${entry.description}

| Campo | Valor |
| --- | --- |
| Categoria | ${markdownCell(entry.category)} |
| Risco | ${markdownCell(entry.risk)} |
| Disponibilidade | ${availability.label} |
| Tags | ${tags.map(markdownCell).join(", ")} |
| Aliases | ${aliases.length > 0 ? aliases.map(markdownCell).join(", ") : "Nenhum"} |

## Melhores casos de uso

${renderList(docs.bestFor)}

## Quando não usar

${renderList(docs.notFor)}

## Exemplos de pedidos reconhecidos

${renderList(docs.examples)}

## Pré-requisitos e ferramentas externas

${renderList(docs.prerequisites)}

## Compatibilidade e instalação

| Client | Disponibilidade | Raiz/política |
| --- | --- | --- |
${compatibility}

${entry.mirrorEverywhere ? "A skill é sincronizada para as raízes nativas configuradas pela política de instalação." : "A skill permanece no catálogo canônico e é disponibilizada sob demanda; ela não ocupa uma raiz nativa por padrão."}

## Recipes e chains relacionadas

${recipes.length > 0 ? recipes.map((recipe) => `- Recipe \`${recipe.id}\`: ${recipe.title}`).join("\n") : "- Nenhuma recipe registrada."}
${chains.length > 0 ? chains.map((chain) => `- Chain \`${chain}\``).join("\n") : "- Nenhuma chain registrada."}

## Evidência mínima de conclusão

${renderList(docs.expectedEvidence)}
${workflow ? `\nPerfil de workflow: \`${workflow.validation}\` (entrada: \`${workflow.entry}\`).` : ""}

## Proveniência

- Upstream: ${markdownCell(provenance.upstream)}
- Versão: ${markdownCell(provenance.version)}
- Licença: ${markdownCell(provenance.license)}
- Steward: ${markdownCell(provenance.steward)}
- Revisado em: ${markdownCell(provenance.reviewedAt)}
- Evidências: ${provenance.evidence.length > 0 ? provenance.evidence.map((item) => `\`${markdownCell(item)}\``).join(", ") : "não informado"}

## Fonte canônica

[\`orquestrador/skills/${name}/SKILL.md\`](${sourcePath})
`;
}

function renderReferenceIndex(context) {
  const entries = Object.entries(context.manifest.skills || {}).sort(([left], [right]) => left.localeCompare(right));
  const byObjective = new Map();
  const byCategory = new Map();
  const byTag = new Map();
  for (const [name, entry] of entries) {
    const objective = ["security", "compliance", "governance"].includes(entry.category)
      ? "Proteger"
      : ["research", "verification", "engineering", "testing", "database", "quality"].includes(entry.category)
        ? "Investigar"
        : ["payments", "integrations", "communication", "ai", "media", "analytics", "observability"].includes(entry.category)
          ? "Integrar"
          : ["documentation"].includes(entry.category)
            ? "Documentar"
            : ["delivery", "maintenance"].includes(entry.category)
              ? "Publicar"
              : "Construir";
    if (!byObjective.has(objective)) byObjective.set(objective, []);
    byObjective.get(objective).push(name);
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category).push(name);
    for (const tag of effectiveTags(name, entry)) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(name);
    }
  }
  const links = (names) => names.sort((left, right) => left.localeCompare(right)).map((name) => `- [${name}](./${name}.md)`).join("\n");
  const objectiveSections = Array.from(byObjective.keys()).sort((left, right) => left.localeCompare(right)).map((objective) => `### ${objective}\n\n${links(byObjective.get(objective))}`).join("\n\n");
  const categorySections = Array.from(byCategory.keys()).sort((left, right) => left.localeCompare(right)).map((category) => `### ${category}\n\n${links(byCategory.get(category))}`).join("\n\n");
  const tagSections = Array.from(byTag.keys()).sort((left, right) => left.localeCompare(right)).map((tag) => `### ${tag}\n\n${links(byTag.get(tag))}`).join("\n\n");
  return `${GENERATED_MARKER}
# Referência de skills

Páginas geradas deterministicamente a partir de [\`SKILLS_MANIFEST.json\`](../../../orquestrador/SKILLS_MANIFEST.json). Total: ${entries.length}.

## Por objetivo

${objectiveSections}

## Por categoria

${categorySections}

## Por tags

${tagSections}
`;
}

function renderCompactCatalog(context) {
  const entries = Object.entries(context.manifest.skills || {}).sort(([left], [right]) => left.localeCompare(right));
  const publicCatalog = readOptionalJson(publicCatalogPath, null);
  const rows = entries.map(([name, entry]) => {
    const availability = entry.mirrorEverywhere ? "Nativa" : "Sob demanda";
    return `| [${name}](skills/reference/${name}.md) | ${markdownCell(entry.category)} | ${markdownCell(entry.risk)} | ${availability} | ${markdownCell(entry.routerSummary || entry.description)} |`;
  }).join("\n");
  return `${GENERATED_MARKER}
# Catálogo de skills

Este catálogo compacto é gerado a partir de [\`orquestrador/SKILLS_MANIFEST.json\`](../orquestrador/SKILLS_MANIFEST.json). Para orientação, consulte o [portal de skills](skills/README.md); para detalhes, abra a [referência individual](skills/reference/README.md).

Total canônico: ${entries.length}
${publicCatalog?.counts?.uniqueSkills ? `Catálogo público deduplicado: ${publicCatalog.counts.uniqueSkills} skills ([manifesto público](../skill-library/PUBLIC_SKILLS_MANIFEST.json)).` : ""}

Atualize e valide este catálogo com \`node scripts/skill-catalog.js generate\`, \`check\` e \`validate\` (ou \`orquestrador-maestro skill-catalog <comando>\`).

| Skill | Categoria | Risco | Disponibilidade | Resumo |
| --- | --- | --- | --- | --- |
${rows}
`;
}

function generatedRoutingDocuments(manifest) {
  const router = readJson(routerPath);
  const routerSkills = isPlainObject(router.skills) ? { ...router.skills } : {};
  for (const [name, entry] of Object.entries(manifest.skills || {}).sort(([left], [right]) => left.localeCompare(right))) {
    const current = isPlainObject(routerSkills[name]) ? routerSkills[name] : {};
    routerSkills[name] = {
      ...current,
      description: entry.routerSummary || entry.description,
      triggers: list(entry.triggers),
      canonicalPath: `{{USER_HOME}}/.orquestrador/skills/${name}/SKILL.md`,
      codexPath: `{{USER_HOME}}/.codex/skills/${name}/SKILL.md`,
      cost: current.cost || (entry.risk === "high" ? "high" : entry.risk === "medium" ? "medium" : "low"),
      safety: current.safety || "task-specific-guardrails",
      priority: Number.isInteger(entry.priority) ? entry.priority : 0,
    };
  }
  for (const name of Object.keys(routerSkills)) if (!manifest.skills?.[name]) delete routerSkills[name];
  router.skills = routerSkills;
  router.version = 2;
  router.routingPolicy = ["canonical-explicit", "alias-exact", "trigger-exact", "alias-contained", "trigger-contained", "capability-route"];
  const aliasMap = {};
  for (const [name, entry] of Object.entries(manifest.skills || {}).sort(([left], [right]) => left.localeCompare(right))) {
    for (const alias of list(entry.aliases)) {
      const current = aliasMap[alias];
      const currentPriority = current ? Number(manifest.skills[current]?.priority || 0) : -1;
      if (!current || Number(entry.priority || 0) > currentPriority || (Number(entry.priority || 0) === currentPriority && name.localeCompare(current) < 0)) aliasMap[alias] = name;
    }
  }
  const aliases = {
    version: 2,
    purpose: "User-facing aliases for automatic skill selection. Keep this compact and point every alias to one canonical skill.",
    aliases: Object.fromEntries(Object.entries(aliasMap).sort(([left], [right]) => left.localeCompare(right, "pt-BR"))),
  };
  return { router, aliases };
}

function generatedArtifacts() {
  const manifest = readJson(manifestPath);
  const routing = generatedRoutingDocuments(manifest);
  const context = {
    manifest,
    policy: readOptionalJson(installPolicyPath, { nativeRoots: {} }),
    chains: readOptionalJson(chainsPath, { chains: {} }),
    recipes: readOptionalJson(recipesPath, { recipes: {} }),
  };
  const artifacts = new Map();
  for (const [name, entry] of Object.entries(manifest.skills || {}).sort(([left], [right]) => left.localeCompare(right))) {
    artifacts.set(path.join(referenceRoot, `${name}.md`), renderSkillPage(name, entry, context));
  }
  artifacts.set(path.join(referenceRoot, "README.md"), renderReferenceIndex(context));
  artifacts.set(compactCatalogPath, renderCompactCatalog(context));
  artifacts.set(routerPath, `${JSON.stringify(routing.router, null, 2)}\n`);
  artifacts.set(aliasesPath, `${JSON.stringify(routing.aliases, null, 2)}\n`);
  return artifacts;
}

function checkGeneratedArtifacts(issues, { requireDirectory = false } = {}) {
  if (!fs.existsSync(referenceRoot)) {
    if (requireDirectory) issues.push("generated: missing docs/skills/reference directory");
    return;
  }
  const artifacts = generatedArtifacts();
  for (const [file, expected] of artifacts.entries()) {
    if (!fs.existsSync(file)) {
      issues.push(`generated:${path.relative(repoRoot, file)}: missing`);
    } else if (fs.readFileSync(file, "utf8") !== expected) {
      issues.push(`generated:${path.relative(repoRoot, file)}: stale; run skill-catalog generate`);
    }
  }
  for (const dirent of fs.readdirSync(referenceRoot, { withFileTypes: true })) {
    if (!dirent.isFile() || !dirent.name.endsWith(".md")) continue;
    const file = path.join(referenceRoot, dirent.name);
    if (!artifacts.has(file) && fs.readFileSync(file, "utf8").startsWith(GENERATED_MARKER)) {
      issues.push(`generated:${path.relative(repoRoot, file)}: stale page not present in manifest`);
    }
  }
}

function generate() {
  const artifacts = generatedArtifacts();
  fs.mkdirSync(referenceRoot, { recursive: true });
  for (const [file, content] of artifacts.entries()) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
  }
  for (const dirent of fs.readdirSync(referenceRoot, { withFileTypes: true })) {
    if (!dirent.isFile() || !dirent.name.endsWith(".md") || dirent.name === "README.md") continue;
    const file = path.join(referenceRoot, dirent.name);
    if (!artifacts.has(file) && fs.readFileSync(file, "utf8").startsWith(GENERATED_MARKER)) fs.unlinkSync(file);
  }
  console.log(`Generated ${artifacts.size} skill catalog artifacts.`);
}

function check() {
  const issues = [];
  checkGeneratedArtifacts(issues, { requireDirectory: true });
  if (issues.length > 0) {
    for (const issue of issues.sort()) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log("Generated skill catalog is up to date.");
}

function validate() {
  const issues = [];
  const manifest = readJson(manifestPath);
  const manifestSchema = fs.existsSync(manifestSchemaPath) ? readJson(manifestSchemaPath) : null;
  const usageSchema = fs.existsSync(usageSchemaPath) ? readJson(usageSchemaPath) : null;
  const router = readJson(routerPath);
  const aliases = readJson(aliasesPath);
  const chains = readJson(chainsPath);
  const profiles = readOptionalJson(profilesPath, { profiles: {} });
  const recipes = readOptionalJson(recipesPath, { recipes: [] });
  const manifestSkills = manifest.skills || {};
  const routerSkills = router.skills || {};
  let provenanceCount = 0;
  let workflowCount = 0;

  validateManifestSchemaDocument(manifest, issues);
  if (manifestSchema) validateManifestSchemaFile(manifestSchema, issues);
  if (usageSchema) validateUsageSchemaDocument(usageSchema, issues);
  validateRecipes(recipes, manifestSkills, profiles, chains, issues);

  for (const [name, entry] of Object.entries(manifestSkills)) {
    if (normalizeSkillName(name) !== name) issues.push(`manifest:${name}: name is not normalized`);
    try {
      assertSkillName(name);
    } catch (error) {
      issues.push(`manifest:${name}: ${error.message}`);
    }
    for (const field of ["description", "category", "risk", "source", "status"]) {
      if (!entry[field]) issues.push(`manifest:${name}: missing ${field}`);
    }
    if (entry.risk) validateEnum(entry.risk, VALID_RISKS, `manifest:${name}.risk`, issues);
    if (entry.status) validateEnum(entry.status, VALID_STATUSES, `manifest:${name}.status`, issues);
    if (Object.prototype.hasOwnProperty.call(entry, "priority") && (!Number.isInteger(entry.priority) || entry.priority < 0)) {
      issues.push(`manifest:${name}.priority: must be an integer >= 0`);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "mirrorEverywhere")) {
      validateBoolean(entry.mirrorEverywhere, `manifest:${name}.mirrorEverywhere`, issues);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "triggers")) {
      validateStringArray(entry.triggers, `manifest:${name}.triggers`, issues, { minItems: 1 });
    }
    if (Object.prototype.hasOwnProperty.call(entry, "aliases")) {
      validateStringArray(entry.aliases, `manifest:${name}.aliases`, issues);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "tags")) {
      validateStringArray(entry.tags, `manifest:${name}.tags`, issues, { minItems: 1 });
    } else if (manifest.version >= 2) {
      issues.push(`manifest:${name}: missing tags`);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "routerSummary")) {
      validateString(entry.routerSummary, `manifest:${name}.routerSummary`, issues);
    } else if (manifest.version >= 2) {
      issues.push(`manifest:${name}: missing routerSummary`);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "documentation")) {
      validateDocumentation(entry.documentation, `manifest:${name}.documentation`, issues);
    } else if (manifest.version >= 2) {
      issues.push(`manifest:${name}: missing documentation`);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "provenance")) {
      provenanceCount++;
      validateProvenance(entry.provenance, `manifest:${name}.provenance`, issues);
      if (manifest.version >= 2 && isPlainObject(entry.provenance)) {
        for (const field of ["upstream", "version", "license"]) {
          if (!Object.prototype.hasOwnProperty.call(entry.provenance, field)) {
            issues.push(`manifest:${name}.provenance: missing ${field}`);
          }
        }
      }
    } else if (manifest.version >= 2) {
      issues.push(`manifest:${name}: missing provenance`);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "workflow")) {
      workflowCount++;
      validateWorkflow(entry.workflow, `manifest:${name}.workflow`, issues);
    }

    const skillFile = path.join(skillsRoot, name, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      issues.push(`skills/${name}: missing SKILL.md`);
      continue;
    }
    const text = fs.readFileSync(skillFile, "utf8");
    const frontmatter = readFrontmatter(skillFile);
    for (const field of ["name", "description", "category", "risk", "source"]) {
      if (!frontmatter[field]) issues.push(`skills/${name}/SKILL.md: missing frontmatter ${field}`);
    }
    if (frontmatter.name && frontmatter.name !== name) {
      issues.push(`skills/${name}/SKILL.md: frontmatter name does not match directory`);
    }
    if (/\b(TODO|FIXME|stub|placeholder)\b/i.test(text)) {
      issues.push(`skills/${name}/SKILL.md: contains TODO/FIXME/stub/placeholder text`);
    }
    if (/(?:Ã.|Â.|â(?:€|‚|„|™|œ|–|—|…))/.test(text)) {
      issues.push(`skills/${name}/SKILL.md: possible mojibake`);
    }
    if (!routerSkills[name]) issues.push(`router:${name}: missing router entry`);
    else if (manifest.version >= 2) {
      const routed = routerSkills[name];
      if (routed.description !== (entry.routerSummary || entry.description)) {
        issues.push(`router:${name}: description is stale; run skill-catalog generate`);
      }
      if (JSON.stringify(list(routed.triggers)) !== JSON.stringify(list(entry.triggers))) {
        issues.push(`router:${name}: triggers are stale; run skill-catalog generate`);
      }
    }
  }

  for (const dirent of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const name = dirent.name;
    if (!fs.existsSync(path.join(skillsRoot, name, "SKILL.md"))) continue;
    if (!manifestSkills[name]) issues.push(`manifest:${name}: skill directory is not registered`);
  }

  const mirroredSkills = Object.entries(manifestSkills)
    .filter(([, entry]) => entry.mirrorEverywhere === true)
    .map(([name]) => name);
  if (mirroredSkills.length > 0) {
    if (!fs.existsSync(installPolicyPath)) {
      issues.push("mirrorEverywhere: missing SKILL_INSTALL_POLICY.json");
    } else {
      try {
        const policy = readJson(installPolicyPath);
        if (!isPlainObject(policy.nativeRoots) || Object.keys(policy.nativeRoots).length === 0) {
          issues.push("mirrorEverywhere: SKILL_INSTALL_POLICY.json has no nativeRoots");
        } else {
          for (const [target, config] of Object.entries(policy.nativeRoots)) {
            if (!isPlainObject(config) || typeof config.path !== "string" || !config.path.trim()) {
              issues.push(`mirrorEverywhere: nativeRoots.${target} must declare a path`);
            }
            if (!Number.isInteger(config?.maxDirectories) || config.maxDirectories < 1) {
              issues.push(`mirrorEverywhere: nativeRoots.${target}.maxDirectories must be a positive integer`);
            }
            const reserved = mirroredSkills.length + (Array.isArray(config?.allowDirectories) ? config.allowDirectories.length : 0);
            if (Number.isInteger(config?.maxDirectories) && config.maxDirectories - reserved < 8) {
              issues.push(`mirrorEverywhere: nativeRoots.${target} must preserve at least eight free directory positions (reserved ${reserved}/${config.maxDirectories})`);
            }
          }
        }
      } catch (error) {
        issues.push(`mirrorEverywhere: invalid SKILL_INSTALL_POLICY.json: ${error.message}`);
      }
    }
    for (const file of [syncShellPath, syncPowerShellPath]) {
      if (!fs.existsSync(file)) {
        issues.push(`mirrorEverywhere: missing synchronizer ${path.basename(file)}`);
        continue;
      }
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes("SKILLS_MANIFEST") || !text.includes("mirrorEverywhere")) {
        issues.push(`mirrorEverywhere: ${path.basename(file)} does not read manifest mirror flags`);
      }
    }
    for (const name of mirroredSkills) {
      if (!fs.existsSync(path.join(skillsRoot, name, "SKILL.md"))) {
        issues.push(`mirrorEverywhere:${name}: canonical source is missing`);
      }
      // Nativa skills must be present in the published Codex snapshot,
      // otherwise npm install cannot deliver them to Codex users.
      if (!fs.existsSync(path.join(repoRoot, "codex", "skills", name, "SKILL.md"))) {
        issues.push(`mirrorEverywhere:${name}: missing from published codex/skills snapshot (resync from orquestrador/skills/${name})`);
      }
    }
  }

  for (const [name, entry] of Object.entries(routerSkills)) {
    if (!manifestSkills[name]) issues.push(`router:${name}: no manifest entry`);
    for (const field of ["description", "triggers", "canonicalPath", "codexPath", "cost", "safety"]) {
      if (!entry[field]) issues.push(`router:${name}: missing ${field}`);
    }
    if (!Array.isArray(entry.triggers) || entry.triggers.length === 0) {
      issues.push(`router:${name}: triggers must be a non-empty array`);
    }
    if (manifestSkills[name] && JSON.stringify(entry.triggers) !== JSON.stringify(manifestSkills[name].triggers)) {
      issues.push(`router:${name}: triggers diverge from manifest`);
    }
  }

  for (const [alias, skill] of Object.entries(aliases.aliases || {})) {
    if (!manifestSkills[skill]) issues.push(`aliases:${alias}: points to missing skill ${skill}`);
    else if (!(manifestSkills[skill].aliases || []).includes(alias)) issues.push(`aliases:${alias}: is not declared by manifest:${skill}`);
  }
  for (const [skill, entry] of Object.entries(manifestSkills)) {
    for (const alias of entry.aliases || []) {
      if (aliases.aliases?.[alias] !== skill) issues.push(`manifest:${skill}.aliases:${alias}: missing or conflicting alias registry entry`);
    }
  }
  if (manifest.version >= 2) {
    for (const [name, entry] of Object.entries(manifestSkills)) {
      for (const alias of list(entry.aliases)) {
        if (aliases.aliases?.[alias] !== name) issues.push(`aliases:${alias}: stale; expected ${name}`);
      }
    }
  }

  const triggerOwners = new Map();
  for (const [skill, entry] of Object.entries(routerSkills)) {
    for (const trigger of entry.triggers || []) {
      const normalized = normalizeTrigger(trigger);
      if (!triggerOwners.has(normalized)) triggerOwners.set(normalized, new Set());
      triggerOwners.get(normalized).add(skill);
    }
  }
  for (const [trigger, owners] of triggerOwners.entries()) {
    if (owners.size > 1) {
      issues.push(`router:${trigger}: ambiguous trigger owners ${Array.from(owners).sort().join(", ")}`);
    }
  }

  for (const [skill, chain] of Object.entries(chains.chains || {})) {
    if (!manifestSkills[skill]) issues.push(`chains:${skill}: chain owner is not in manifest`);
    for (const target of chain.mayInvoke || []) {
      if (!manifestSkills[target]) issues.push(`chains:${skill}: mayInvoke points to missing skill ${target}`);
    }
  }

  const chainState = new Map();
  const chainStack = [];
  function visitChain(skill) {
    const state = chainState.get(skill);
    if (state === "visiting") {
      const cycleStart = chainStack.indexOf(skill);
      const cycle = chainStack.slice(cycleStart).concat(skill).join(" -> ");
      issues.push(`chains:${skill}: cycle detected ${cycle}`);
      return;
    }
    if (state === "visited") return;
    chainState.set(skill, "visiting");
    chainStack.push(skill);
    for (const target of (chains.chains[skill] && chains.chains[skill].mayInvoke) || []) visitChain(target);
    chainStack.pop();
    chainState.set(skill, "visited");
  }
  for (const skill of Object.keys(chains.chains || {})) visitChain(skill);

  if (manifest.version >= 2 || fs.existsSync(referenceRoot)) checkGeneratedArtifacts(issues, { requireDirectory: manifest.version >= 2 });

  if (issues.length > 0) {
    console.error("Skill validation failed:");
    for (const issue of issues.sort()) console.error(`  - ${issue}`);
    process.exit(1);
  }
  const defaultProvenance = manifest.defaults && manifest.defaults.provenance ? 1 : 0;
  const defaultWorkflow = manifest.defaults && manifest.defaults.workflow ? 1 : 0;
  console.log(
    `Skill validation passed. Skills: ${Object.keys(manifestSkills).length}. Provenance metadata: ${provenanceCount} overrides + ${defaultProvenance} default. Workflow metadata: ${workflowCount} overrides + ${defaultWorkflow} default.`
  );
}

function printMirrorEverywhere() {
  const manifest = readJson(manifestPath);
  for (const [name, entry] of Object.entries(manifest.skills || {})) {
    if (entry.mirrorEverywhere) console.log(name);
  }
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "new") createSkill(parseArgs(rest));
  else if (command === "generate") generate();
  else if (command === "check") check();
  else if (command === "validate") validate();
  else if (command === "mirror-everywhere") printMirrorEverywhere();
  else {
    console.error("Usage: skill-catalog.js <new|generate|check|validate|mirror-everywhere> [options]");
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
