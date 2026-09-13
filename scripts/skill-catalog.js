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
  const allowedKeys = new Set(["evidence", "steward", "reviewedAt", "legacyCompatible", "notes"]);
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
  manifest.skills[name] = {
    description,
    category,
    risk,
    source,
    mirrorEverywhere: Boolean(args.mirrorEverywhere),
    triggers,
    aliases,
    status: "canonical",
  };
  writeJson(manifestPath, manifest);

  const router = readJson(routerPath);
  router.skills[name] = {
    description,
    triggers,
    canonicalPath: `{{USER_HOME}}/.orquestrador/skills/${name}/SKILL.md`,
    codexPath: `{{USER_HOME}}/.codex/skills/${name}/SKILL.md`,
    cost: risk === "high" ? "high" : risk === "medium" ? "medium" : "low",
    safety: "task-specific-guardrails",
  };
  writeJson(routerPath, router);

  const aliasDoc = readJson(aliasesPath);
  for (const alias of aliases) {
    aliasDoc.aliases[alias] = name;
  }
  writeJson(aliasesPath, aliasDoc);

  console.log(`Created ${path.relative(repoRoot, skillFile)}`);
  console.log(`Updated ${path.relative(repoRoot, manifestPath)}, SKILLS_ROUTER.json, and SKILL_ALIASES.json`);
}

function validate() {
  const issues = [];
  const manifest = readJson(manifestPath);
  const manifestSchema = fs.existsSync(manifestSchemaPath) ? readJson(manifestSchemaPath) : null;
  const usageSchema = fs.existsSync(usageSchemaPath) ? readJson(usageSchemaPath) : null;
  const router = readJson(routerPath);
  const aliases = readJson(aliasesPath);
  const chains = readJson(chainsPath);
  const manifestSkills = manifest.skills || {};
  const routerSkills = router.skills || {};
  let provenanceCount = 0;
  let workflowCount = 0;

  validateManifestSchemaDocument(manifest, issues);
  if (manifestSchema) validateManifestSchemaFile(manifestSchema, issues);
  if (usageSchema) validateUsageSchemaDocument(usageSchema, issues);

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
    if (Object.prototype.hasOwnProperty.call(entry, "mirrorEverywhere")) {
      validateBoolean(entry.mirrorEverywhere, `manifest:${name}.mirrorEverywhere`, issues);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "triggers")) {
      validateStringArray(entry.triggers, `manifest:${name}.triggers`, issues, { minItems: 1 });
    }
    if (Object.prototype.hasOwnProperty.call(entry, "aliases")) {
      validateStringArray(entry.aliases, `manifest:${name}.aliases`, issues);
    }
    if (Object.prototype.hasOwnProperty.call(entry, "provenance")) {
      provenanceCount++;
      validateProvenance(entry.provenance, `manifest:${name}.provenance`, issues);
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
  }

  for (const dirent of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const name = dirent.name;
    if (!fs.existsSync(path.join(skillsRoot, name, "SKILL.md"))) continue;
    if (!manifestSkills[name]) issues.push(`manifest:${name}: skill directory is not registered`);
  }

  for (const [name, entry] of Object.entries(routerSkills)) {
    if (!manifestSkills[name]) issues.push(`router:${name}: no manifest entry`);
    for (const field of ["description", "triggers", "canonicalPath", "codexPath", "cost", "safety"]) {
      if (!entry[field]) issues.push(`router:${name}: missing ${field}`);
    }
    if (!Array.isArray(entry.triggers) || entry.triggers.length === 0) {
      issues.push(`router:${name}: triggers must be a non-empty array`);
    }
  }

  for (const [alias, skill] of Object.entries(aliases.aliases || {})) {
    if (!manifestSkills[skill]) issues.push(`aliases:${alias}: points to missing skill ${skill}`);
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
  else if (command === "validate") validate();
  else if (command === "mirror-everywhere") printMirrorEverywhere();
  else {
    console.error("Usage: skill-catalog.js <new|validate|mirror-everywhere> [options]");
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
