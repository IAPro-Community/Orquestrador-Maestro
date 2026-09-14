import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_FILES = 250;
const MAX_FILE_BYTES = 256 * 1024;
const MIN_IMPLEMENTATION_CONFIDENCE = 0.8;
const PROFILE_NAMES = new Set(["design-profile.json", "design-profile.yaml", "design-profile.yml"]);
const INSTRUCTION_NAMES = new Set(["AGENTS.md", "CLAUDE.md", "README.md", "frontend.md", "design.md"]);

function walk(current, files = []) {
  if (files.length >= MAX_FILES) return files;
  let entries = [];
  try { entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return files; }
  for (const entry of entries) {
    // Never follow symlinks: a linked file could pull outside-root content
    // into the scan, and a linked directory could escape the scope.
    if (entry.isSymbolicLink()) continue;
    if (files.length >= MAX_FILES || ["node_modules", ".git", "dist", "build", "coverage"].includes(entry.name)) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|md|json|ya?ml)$/iu.test(entry.name)) files.push(full);
  }
  return files;
}

function readText(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_FILE_BYTES) return "";
    return fs.readFileSync(file, "utf8");
  } catch { return ""; }
}

function relativePath(root, file) { return path.relative(root, file) || path.basename(file); }

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function providerFromText(text) {
  const matches = text.match(/(?:from\s+["']|require\(\s*["']|@)([@\w.-]+\/(?:ui|design-system|components|theme)[\w./-]*)/giu) || [];
  const imported = matches.map((item) => {
    const value = item.replace(/^(?:from\s+["']|require\(\s*["']|@)/iu, "");
    return value.startsWith("@") ? value : `@${value}`;
  });
  const declared = text.match(/(?:design\s*system|component\s*library|theme)\s*(?:is|:|=|->)\s*["'`]?(@[A-Za-z0-9][\w./@-]*|[A-Za-z0-9][\w.-]*\/[\w./-]+)/iu);
  if (declared?.[1]) imported.push(declared[1]);
  return imported;
}

function cleanScalar(value) {
  const withoutComment = String(value || "").replace(/\s+#.*$/u, "").trim();
  return withoutComment.replace(/^(?:["'])(.*)(?:["'])$/u, "$1").trim();
}

function yamlProvider(text) {
  const inline = text.match(/(?:designSystem|design-system)\s*:\s*\{[^}]*\bprovider\s*:\s*([^,}]+)/iu);
  if (inline?.[1]) return cleanScalar(inline[1]);
  const lines = String(text || "").split(/\r?\n/u);
  let designSystemIndent = null;
  for (const line of lines) {
    if (/^\s*(?:#|$)/u.test(line)) continue;
    const indent = line.match(/^\s*/u)?.[0].length || 0;
    const designSystem = line.match(/^\s*(designSystem|design-system)\s*:\s*$/iu);
    if (designSystem) { designSystemIndent = indent; continue; }
    if (designSystemIndent !== null && indent <= designSystemIndent) designSystemIndent = null;
    if (designSystemIndent !== null) {
      const provider = line.match(/^\s*provider\s*:\s*(.+)$/iu);
      if (provider) return cleanScalar(provider[1]);
    }
  }
  return "";
}

function jsonProvider(value) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) { const provider = jsonProvider(item); if (provider) return provider; }
    return "";
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^design[-_]?system$/iu.test(key) && child && typeof child === "object" && typeof child.provider === "string") return child.provider.trim();
    const provider = jsonProvider(child);
    if (provider) return provider;
  }
  return "";
}

function profileProvider(file) {
  const text = readText(file);
  if (!text) return "";
  if (/\.json$/iu.test(file)) {
    try { return jsonProvider(JSON.parse(text)); } catch { return ""; }
  }
  return yamlProvider(text);
}

function collectConfiguredProfilePaths(packageFiles, root) {
  const configured = [];
  const visit = (value, key = "", underFrontendExcellence = false, baseDirectory = root) => {
    if (typeof value === "string" && ((/design[-_]?profile(?:[-_]?path|[-_]?file)?$/iu.test(key)) || (underFrontendExcellence && /^(?:profile|profile[-_]?path|profile[-_]?file|path)$/iu.test(key)))) {
      configured.push(path.resolve(baseDirectory, value));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [childKey, child] of Object.entries(value)) {
      visit(child, childKey, underFrontendExcellence || /^(?:frontend[-_]?excellence|design[-_]?system|design[-_]?profile)$/iu.test(key), baseDirectory);
    }
  };
  for (const file of packageFiles) {
    try { visit(JSON.parse(readText(file)), "", false, path.dirname(file)); } catch { /* Ignore malformed package metadata. */ }
  }
  return [...new Set(configured)].filter((file) => isWithin(root, file));
}

function isRealWithin(root, file) {
  try {
    return isWithin(fs.realpathSync(root), fs.realpathSync(file));
  } catch { return false; }
}

function profileFiles(root, files) {
  const packageFiles = files.filter((file) => path.basename(file).toLowerCase() === "package.json");
  const configured = collectConfiguredProfilePaths(packageFiles, root);
  const discovered = files.filter((file) => PROFILE_NAMES.has(path.basename(file).toLowerCase()));
  // existsSync follows symlinks, so re-resolve: a configured or discovered
  // profile path must still point inside the root after resolution.
  return [...new Set([...configured, ...discovered])].filter((file) => isRealWithin(root, file)).sort();
}

function instructionFiles(files) {
  return files.filter((file) => INSTRUCTION_NAMES.has(path.basename(file)) || /(?:^|[\\/])docs[\\/](?:frontend|design)\.md$/iu.test(file));
}

function result(status, provider, confidence, evidence, alternatives = []) {
  const implementationAllowed = status === "resolved" && confidence >= MIN_IMPLEMENTATION_CONFIDENCE;
  return Object.freeze({
    status: implementationAllowed ? "resolved" : status === "resolved" ? "ambiguous" : status,
    provider: implementationAllowed ? provider : null,
    confidence,
    evidence: Object.freeze(evidence),
    alternatives: Object.freeze(alternatives),
    requiresUserDecision: !implementationAllowed,
    implementationAllowed
  });
}

function instructionResult(root, files) {
  const candidates = new Map();
  for (const file of instructionFiles(files)) {
    const providers = [...new Set(providerFromText(readText(file)))];
    for (const provider of providers) {
      if (!candidates.has(provider)) candidates.set(provider, []);
      candidates.get(provider).push({ type: "project-instruction", path: relativePath(root, file), confidence: 1 });
    }
  }
  if (candidates.size === 0) return null;
  const evidence = [...candidates.values()].flat();
  if (candidates.size > 1) return result("ambiguous", null, 0.5, evidence, [...candidates.keys()].sort());
  const [provider] = candidates.keys();
  return result("resolved", provider, 1, evidence);
}

function profileResult(root, files) {
  const candidates = new Map();
  for (const file of profileFiles(root, files)) {
    const provider = profileProvider(file);
    if (!provider) continue;
    if (!candidates.has(provider)) candidates.set(provider, []);
    candidates.get(provider).push({ type: "design-profile", path: relativePath(root, file), confidence: 0.95 });
  }
  if (candidates.size === 0) return null;
  const evidence = [...candidates.values()].flat();
  if (candidates.size > 1) return result("ambiguous", null, 0.5, evidence, [...candidates.keys()].sort());
  const [provider] = candidates.keys();
  return result("resolved", provider, 0.95, evidence);
}

function dependencyNames(files) {
  const dependencies = new Set();
  for (const file of files.filter((item) => path.basename(item).toLowerCase() === "package.json")) {
    try {
      const pkg = JSON.parse(readText(file));
      for (const key of ["dependencies", "devDependencies", "peerDependencies"]) {
        for (const name of Object.keys(pkg[key] || {})) if (/(?:ui|design-system|components|theme)/iu.test(name)) dependencies.add(name);
      }
    } catch { /* Ignore malformed or absent package metadata. */ }
  }
  return [...dependencies].sort();
}

function importResult(root, files) {
  const counts = new Map();
  for (const file of files.filter((item) => !PROFILE_NAMES.has(path.basename(item).toLowerCase()) && path.basename(item).toLowerCase() !== "package.json")) {
    for (const provider of providerFromText(readText(file))) counts.set(provider, (counts.get(provider) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0) return null;
  const [provider, matches] = ranked[0];
  const confidence = Math.min(0.95, 0.6 + matches * 0.05);
  const tied = ranked.filter(([, count]) => count === matches).map(([name]) => name);
  const evidence = [{ type: "import-usage", provider, matches, confidence }];
  if (tied.length > 1) return result("ambiguous", null, confidence, evidence, tied);
  return result("resolved", provider, confidence, evidence);
}

function analyze(root, files) {
  // Precedence is intentional: explicit project instructions beat a checked-in
  // Design Profile, which beats import usage, which beats installed
  // dependencies. Profiles therefore always prevail over imports and
  // dependency-only evidence.
  return instructionResult(root, files)
    || profileResult(root, files)
    || importResult(root, files)
    || (() => {
      const dependencies = dependencyNames(files);
      return dependencies.length > 0 ? result("unresolved", null, 0.3, [{ type: "dependency-only", providers: dependencies, confidence: 0.3 }], dependencies) : null;
    })()
    || result("unresolved", null, 0, []);
}

function scopedFiles(root, taskScope) {
  const scope = String(taskScope || "").trim();
  if (!scope) return null;
  const candidate = path.resolve(root, scope);
  if (!isWithin(root, candidate) || !fs.existsSync(candidate)) return [];
  try {
    // A scoped symlink must resolve inside the root, otherwise the scope
    // could pull outside content into the analysis.
    if (fs.lstatSync(candidate).isSymbolicLink() && !isRealWithin(root, candidate)) return [];
  } catch { return []; }
  let stat;
  try { stat = fs.statSync(candidate); } catch { return []; }
  if (stat.isDirectory()) return walk(candidate);
  return [candidate];
}

export function discoverDesignSystem({ cwd = process.cwd(), taskScope = "" } = {}) {
  const root = path.resolve(cwd);
  const allFiles = walk(root);
  const localFiles = scopedFiles(root, taskScope);
  const localResult = localFiles === null ? null : analyze(root, localFiles);
  if (localResult && (localResult.status !== "unresolved" || localResult.evidence.length > 0)) return localResult;
  return analyze(root, allFiles);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const resultValue = discoverDesignSystem({ cwd: process.argv[2] || process.cwd(), taskScope: process.argv[3] || "" });
  process.stdout.write(`${JSON.stringify(resultValue, null, 2)}\n`);
}
