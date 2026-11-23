"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
/**
 * Root-level build markers are signals, never proof that an application is
 * implemented or that its tests run. Deliberately no recursive filesystem
 * walk, process execution, dependency installation, or code generation.
 */
const BUILD_MARKERS = Object.freeze([
  ["pom.xml", "Java", "Maven"],
  ["build.gradle", "Java/Kotlin", "Gradle"],
  ["build.gradle.kts", "Java/Kotlin", "Gradle"],
  ["pyproject.toml", "Python", "pyproject"],
  ["requirements.txt", "Python", "pip"],
  ["go.mod", "Go", "Go Modules"],
  ["Cargo.toml", "Rust", "Cargo"],
  ["composer.json", "PHP", "Composer"],
  ["Gemfile", "Ruby", "Bundler"]
]);

function isRegularFile(file) {
  try { return fs.lstatSync(file).isFile(); }
  catch { return false; }
}


/**
 * Monta um snapshot de contexto do projeto sem perguntar nada ao usuário.
 * Usa o context-brief existente + leitura direta de artefatos DEV/.
 */
function gatherPreflight(workspacePath, intent, options = {}) {
  const facts = {
    projectName: path.basename(workspacePath),
    stack: null,
    dependencies: {},
    devState: null,
    hasAuth: false,
    hasDatabase: false,
    hasPayments: false,
    hasTests: false,
    framework: null,
    existingRoutes: [],
    fileCount: 0,
    // Additional additive provenance fields. Legacy consumers keep stack,
    // hasTests, framework and dependencies unchanged for Node projects.
    stackSourcePath: null,
    projectNameSourcePath: null,
    buildSignals: []
  };

  // 1. Package.json analysis
  const pkgPath = path.join(workspacePath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      facts.projectName = pkg.name || facts.projectName;
      facts.projectNameSourcePath = pkg.name ? "package.json" : null;
      facts.dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
      facts.stack = detectStack(facts.dependencies);
      facts.stackSourcePath = "package.json";
      facts.framework = detectFramework(facts.dependencies);
      facts.hasAuth = hasAuthDep(facts.dependencies);
      facts.hasDatabase = hasDatabaseDep(facts.dependencies);
      facts.hasPayments = hasPaymentDep(facts.dependencies);
      facts.hasTests = Boolean(pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1');
    } catch { /* corrupt package.json */ }
  }

  // 2. Stack signals outside the npm ecosystem. These only inspect
  // root-level, non-symlinked build manifests and cannot claim test success.
  const markers = BUILD_MARKERS
    .filter(([file]) => isRegularFile(path.join(workspacePath, file)))
    .map(([file, stack, tool]) => Object.freeze({ path: file, stack, tool }));
  facts.buildSignals = Object.freeze([
    ...(facts.stackSourcePath ? [{ path: "package.json", stack: facts.stack, tool: "npm" }] : []),
    ...markers
  ]);
  if (!facts.stack && markers.length === 1) {
    facts.stack = markers[0].stack;
    facts.stackSourcePath = markers[0].path;
  }
  // A multi-stack repository must report all concrete signals rather
  // than guessing one dominant stack from file names alone.

  // 3. DEV state (HANDOFF, CONTEXT, SPECS/ACTIVE)
  for (const devFile of ["DEV/HANDOFF.md", "DEV/CONTEXT.md", "DEV/SPECS/ACTIVE.md"]) {
    const devPath = path.join(workspacePath, devFile);
    if (fs.existsSync(devPath)) {
      facts.devState = facts.devState || {};
      facts.devState[devFile] = fs.readFileSync(devPath, "utf8").slice(0, 2000);
    }
  }

  // 3. AGENTS.md
  const agentsPath = path.join(workspacePath, "AGENTS.md");
  if (fs.existsSync(agentsPath)) {
    facts.agentsContract = fs.readFileSync(agentsPath, "utf8").slice(0, 1500);
  }

  // 4. Context brief (if available)
  const briefScript = path.join(__dirname, "..", "..", "orquestrador", "bin", "context-brief.js");
  if (fs.existsSync(briefScript)) {
    try {
      const briefMaxChars = Number.isInteger(options.briefMaxChars) ? Math.max(1000, Math.min(64000, options.briefMaxChars)) : 8000;
      const result = execFileSync("node", [briefScript, "brief", "--project-path", workspacePath, "--task", intent, "--json", "--max-chars", String(briefMaxChars)], { encoding: "utf8", timeout: 10000 });
      facts.contextBrief = JSON.parse(result);
    } catch { /* context-brief unavailable or failed */ }
  }

  return Object.freeze(facts);
}

function detectStack(deps) {
  if (deps.next) return "Next.js";
  if (deps.nuxt) return "Nuxt";
  if (deps.react) return "React";
  if (deps.svelte || deps["@sveltejs/kit"]) return "SvelteKit";
  if (deps.express) return "Express";
  if (deps.fastify) return "Fastify";
  return "Node.js";
}

function detectFramework(deps) {
  if (deps.next) return "nextjs";
  if (deps.vite) return "vite";
  if (deps.nuxt) return "nuxt";
  return null;
}

function hasAuthDep(deps) {
  return Boolean(deps["@supabase/supabase-js"] || deps["next-auth"] || deps.passport || deps["@clerk/nextjs"] || deps["@auth/core"]);
}

function hasDatabaseDep(deps) {
  return Boolean(deps.prisma || deps["@prisma/client"] || deps.drizzle || deps.knex || deps.sequelize || deps["@supabase/supabase-js"]);
}

function hasPaymentDep(deps) {
  return Boolean(deps.stripe || deps["@stripe/stripe-js"] || deps.abacatepay);
}

module.exports = { gatherPreflight };
