#!/usr/bin/env node
/**
 * Validate a project Design Profile against a configured or bundled schema.
 * Usage: node validate-design-profile.mjs [--schema <file>] <profile>
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const BUNDLED_SCHEMA = path.resolve(__dirname, "../schemas/design-profile.schema.json");

function stripYamlComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === "'" || char === '"') && value[index - 1] !== "\\") {
      quote = quote === char ? null : quote || char;
    }
    if (char === "#" && !quote && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function parseScalar(raw) {
  const value = stripYamlComment(raw.trim());
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?(?:0|[1-9]\d*)$/.test(value)) return Number(value);
  if (/^-?(?:\d+\.\d*|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value[0] === '"' ? JSON.parse(value) : value.slice(1, -1).replace(/''/g, "'");
  }
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Unsupported inline YAML value: ${value}`);
    }
  }
  return value;
}

function parseYamlFallback(text) {
  const sourceLines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines = sourceLines
    .map((raw, index) => ({ raw, index: index + 1 }))
    .filter(({ raw }) => raw.trim() && !raw.trim().startsWith("#") && !raw.trim().startsWith("---") && !raw.trim().startsWith("$schema"));

  const root = {};
  const stack = [{ indent: -1, value: root }];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const { raw, index } = lines[lineIndex];
    if (/\t/.test(raw)) throw new Error(`Tabs are not supported in fallback YAML parser (line ${index})`);
    const indent = raw.match(/^ */)[0].length;
    const trimmed = stripYamlComment(raw.trim());
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    if (trimmed.startsWith("- ") || trimmed === "-") {
      if (!Array.isArray(parent)) throw new Error(`Array item without array parent (line ${index})`);
      const itemRaw = trimmed.slice(1).trim();
      if (!itemRaw) {
        const child = {};
        parent.push(child);
        stack.push({ indent, value: child });
        continue;
      }
      const separator = itemRaw.indexOf(":");
      if (separator > 0) {
        const child = {};
        parent.push(child);
        const key = itemRaw.slice(0, separator).trim();
        child[key] = parseScalar(itemRaw.slice(separator + 1));
        stack.push({ indent, value: child });
      } else {
        parent.push(parseScalar(itemRaw));
      }
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator <= 0) throw new Error(`Invalid mapping (line ${index}): ${trimmed}`);
    if (Array.isArray(parent)) throw new Error(`Mapping must follow an object item (line ${index})`);
    const key = trimmed.slice(0, separator).trim();
    if (Object.prototype.hasOwnProperty.call(parent, key)) throw new Error(`Duplicate key '${key}' (line ${index})`);
    const rest = trimmed.slice(separator + 1).trim();
    if (rest) {
      parent[key] = parseScalar(rest);
      continue;
    }

    const next = lines[lineIndex + 1];
    const nextTrimmed = next ? stripYamlComment(next.raw.trim()) : "";
    const child = next && next.raw.match(/^ */)[0].length > indent && nextTrimmed.startsWith("-") ? [] : {};
    parent[key] = child;
    stack.push({ indent, value: child });
  }
  return root;
}

function tryExternalYamlParser(text) {
  for (const packageName of ["yaml", "js-yaml"]) {
    try {
      const parser = require(packageName);
      return packageName === "yaml" ? parser.parse(text) : parser.load(text);
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  return null;
}

function parseYaml(text) {
  const parsed = tryExternalYamlParser(text);
  return parsed === null ? parseYamlFallback(text) : parsed;
}

function readPackageConfig(startDirectory) {
  let directory = path.resolve(startDirectory);
  while (true) {
    const packagePath = path.join(directory, "package.json");
    if (fs.existsSync(packagePath)) {
      try {
        return { path: packagePath, value: JSON.parse(fs.readFileSync(packagePath, "utf8")) };
      } catch (error) {
        throw new Error(`Invalid package.json at ${packagePath}: ${error.message}`);
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function resolveConfiguredSchema(profileDirectory, explicitSchema) {
  const candidates = [];
  if (explicitSchema) candidates.push(path.resolve(profileDirectory, explicitSchema));
  if (process.env.DESIGN_PROFILE_SCHEMA) candidates.push(path.resolve(profileDirectory, process.env.DESIGN_PROFILE_SCHEMA));
  for (const relative of [
    ".design-profile.schema.json",
    ".frontend-excellence/design-profile.schema.json",
    "design-profile.schema.json",
    ".config/design-profile.schema.json",
  ]) {
    candidates.push(path.resolve(profileDirectory, relative));
  }

  const packageConfig = readPackageConfig(profileDirectory);
  const configured = packageConfig?.value?.frontendExcellence?.designProfileSchema
    || packageConfig?.value?.designProfileSchema;
  if (configured) candidates.push(path.resolve(path.dirname(packageConfig.path), configured));

  for (const packageName of ["design-system/design-profile/schema", "@design-system/design-profile/schema"]) {
    try {
      candidates.push(require.resolve(packageName, { paths: [profileDirectory] }));
    } catch {
      // Optional package export.
    }
  }
  candidates.push(BUNDLED_SCHEMA);

  const uniqueCandidates = [...new Set(candidates)];
  const found = uniqueCandidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("No Design Profile schema was found");
  return found;
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function validate(schema, data, pathLabel, errors) {
  if (schema.const !== undefined && data !== schema.const) errors.push(`${pathLabel}: expected const ${JSON.stringify(schema.const)}`);
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = Number.isInteger(data) ? "integer" : typeOf(data);
    const compatible = allowed.includes(actual) || (allowed.includes("number") && actual === "integer");
    if (!compatible) {
      errors.push(`${pathLabel}: expected ${allowed.join(" or ")}, got ${actual}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(data)) errors.push(`${pathLabel}: ${JSON.stringify(data)} is not in enum`);
  if (schema.minLength && typeof data === "string" && data.length < schema.minLength) errors.push(`${pathLabel}: shorter than minLength`);
  if (schema.minItems && Array.isArray(data) && data.length < schema.minItems) errors.push(`${pathLabel}: fewer than minItems`);
  if (schema.minimum !== undefined && typeof data === "number" && data < schema.minimum) errors.push(`${pathLabel}: below minimum`);
  if (schema.required && data && typeof data === "object") {
    for (const key of schema.required) if (data[key] === undefined) errors.push(`${pathLabel}: missing required ${key}`);
  }
  if (schema.additionalProperties === false && data && typeOf(data) === "object" && !Array.isArray(data)) {
    const allowed = new Set(Object.keys(schema.properties || {}));
    for (const key of Object.keys(data)) if (!allowed.has(key)) errors.push(`${pathLabel}: unknown field ${key}`);
  }
  if (schema.properties && data && typeOf(data) === "object") {
    for (const [key, child] of Object.entries(schema.properties)) if (data[key] !== undefined) validate(child, data[key], `${pathLabel}.${key}`, errors);
  }
  if (schema.items && Array.isArray(data)) data.forEach((item, index) => validate(schema.items, item, `${pathLabel}[${index}]`, errors));
}

function loadDocument(file) {
  const text = fs.readFileSync(file, "utf8");
  return file.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseYaml(text);
}

function validateDesignProfile(file, options = {}) {
  const profilePath = path.resolve(file);
  const schemaPath = resolveConfiguredSchema(path.dirname(profilePath), options.schema);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const data = loadDocument(profilePath);
  const errors = [];
  validate(schema, data, "$", errors);
  return { ok: errors.length === 0, errors, data, schemaPath };
}

export { parseYaml, resolveConfiguredSchema, validateDesignProfile };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const schemaIndex = args.indexOf("--schema");
  const schema = schemaIndex >= 0 ? args[schemaIndex + 1] : undefined;
  if (schemaIndex >= 0) args.splice(schemaIndex, 2);
  const file = args[0];
  if (!file) {
    console.error("Usage: node validate-design-profile.mjs [--schema <file>] <profile>");
    process.exit(2);
  }
  try {
    const result = validateDesignProfile(file, { schema });
    if (!result.ok) {
      console.error(result.errors.join("\n"));
      process.exit(1);
    }
    console.log(`Design Profile OK: ${file} (schema: ${result.schemaPath})`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
