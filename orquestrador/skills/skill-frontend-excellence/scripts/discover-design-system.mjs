import fs from "node:fs";
import path from "node:path";

const MAX_FILES = 250;
const MAX_FILE_BYTES = 256 * 1024;
const GENERIC = new Set(["react", "vue", "angular", "tailwindcss", "typescript", "vite"]);

function walk(root, current = root, files = []) {
  if (files.length >= MAX_FILES) return files;
  let entries = [];
  try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    if (files.length >= MAX_FILES || ["node_modules", ".git", "dist", "build", "coverage"].includes(entry.name)) continue;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(root, full, files);
    else if (/\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|md|json)$/iu.test(entry.name)) files.push(full);
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

function providerFromText(text) {
  const matches = text.match(/(?:from\s+["']|require\(\s*["']|@)([@\w.-]+\/(?:ui|design-system|components|theme)[\w./-]*)/giu) || [];
  return matches.map((item) => {
    const value = item.replace(/^(?:from\s+["']|require\(\s*["']|@)/iu, "");
    return value.startsWith("@") ? value : `@${value}`;
  });
}

function result(status, provider, confidence, evidence, alternatives = []) {
  return Object.freeze({ status, provider: provider || null, confidence, evidence: Object.freeze(evidence), alternatives: Object.freeze(alternatives), requiresUserDecision: status !== "resolved", implementationAllowed: status === "resolved" });
}

export function discoverDesignSystem({ cwd = process.cwd(), taskScope = "" } = {}) {
  const root = path.resolve(cwd);
  const evidence = [];
  const instructionFiles = ["AGENTS.md", "CLAUDE.md", "README.md", "docs/frontend.md", "docs/design.md"]
    .map((file) => path.join(root, file)).filter((file) => fs.existsSync(file));
  for (const file of instructionFiles) {
    const text = readText(file);
    const providers = providerFromText(text).filter((item) => !GENERIC.has(item));
    if (providers.length > 0 && /design\s*system|component|theme/iu.test(text)) {
      const provider = providers[0];
      evidence.push({ type: "project-instruction", path: path.relative(root, file), confidence: 1 });
      return result("resolved", provider, 1, evidence);
    }
  }
  const packageFiles = [path.join(root, "package.json"), ...walk(root).filter((file) => /package\.json$/iu.test(file))];
  const dependencies = new Set();
  for (const file of [...new Set(packageFiles)]) {
    try {
      const pkg = JSON.parse(readText(file));
      for (const key of ["dependencies", "devDependencies", "peerDependencies"]) for (const name of Object.keys(pkg[key] || {})) {
        if (!GENERIC.has(name) && /(?:ui|design-system|components|theme)/iu.test(name)) dependencies.add(name);
      }
    } catch { /* Ignore malformed or absent package metadata. */ }
  }
  const counts = new Map();
  for (const file of walk(root).filter((file) => !/package\.json$/iu.test(file))) {
    const text = readText(file);
    for (const provider of providerFromText(text)) counts.set(provider, (counts.get(provider) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length > 0) {
    const [provider, matches] = ranked[0];
    const tied = ranked.filter(([, count]) => count === matches).map(([name]) => name);
    evidence.push({ type: "import-usage", matches, confidence: Math.min(0.95, 0.6 + matches * 0.05) });
    if (tied.length > 1) return result("ambiguous", null, 0.5, evidence, tied);
    return result("resolved", provider, Math.min(0.95, 0.6 + matches * 0.05), evidence);
  }
  if (dependencies.size > 0) {
    evidence.push({ type: "dependency-only", providers: [...dependencies].sort(), confidence: 0.3 });
  }
  return result("unresolved", null, dependencies.size > 0 ? 0.3 : 0, evidence);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const resultValue = discoverDesignSystem({ cwd: process.argv[2] || process.cwd() });
  process.stdout.write(`${JSON.stringify(resultValue, null, 2)}\n`);
}
