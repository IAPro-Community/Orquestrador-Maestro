"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { gitExec, resolveGitContext } = require("../../orquestrador/lib/git-context");

const STACK_CAPABILITY_MAP = Object.freeze({
  react: ["frontend"],
  next: ["frontend"],
  vue: ["frontend"],
  nuxt: ["frontend"],
  angular: ["frontend"],
  svelte: ["frontend"],
  astro: ["frontend"],
  node: ["engineering", "api-design"],
  nestjs: ["engineering", "api-design"],
  express: ["engineering", "api-design"],
  go: ["engineering"],
  java: ["engineering"],
  gradle: ["engineering"],
  maven: ["engineering"],
  dotnet: ["engineering"],
  python: ["engineering"],
  php: ["engineering"],
  ruby: ["engineering"],
  rust: ["engineering"],
  prisma: ["database"],
  docker: ["containers"],
  kubernetes: ["kubernetes"],
  "github-actions": ["ci"],
  "gitlab-ci": ["ci"]
});

const FILE_CAPABILITY_RULES = Object.freeze([
  { pattern: /(?:^|\/)(?:src\/)?(?:components|pages|app|views|ui)(?:\/|$)|\.(?:tsx|jsx|vue|svelte)$/iu, capabilities: ["frontend"] },
  { pattern: /(?:^|\/)(?:test|tests|__tests__|e2e|spec)(?:\/|$)|\.(?:test|spec)\.[^.]+$/iu, capabilities: ["testing"] },
  { pattern: /(?:migration|migrations|schema|prisma|\.sql$)/iu, capabilities: ["database"] },
  { pattern: /(?:^|\/)\.github\/workflows\/|(?:^|\/)\.gitlab-ci\.ya?ml$/iu, capabilities: ["ci"] },
  { pattern: /(?:^|\/)(?:Dockerfile|docker-compose[^/]*\.ya?ml)$/iu, capabilities: ["containers"] },
  { pattern: /(?:^|\/)(?:k8s|kubernetes|helm|charts)(?:\/|$)/iu, capabilities: ["kubernetes"] },
  { pattern: /(?:^|\/)(?:README|docs?)(?:\.|\/|$)|\.md$/iu, capabilities: ["documentation"] },
  { pattern: /(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|nx\.json|turbo\.json|pom\.xml|build\.gradle[^/]*|go\.mod|pyproject\.toml)$/iu, capabilities: ["build-tooling"] }
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveChangedFiles(workspacePath) {
  const git = resolveGitContext(workspacePath);
  if (git.vcs !== "git") return Object.freeze([]);
  const tracked = gitExec(["diff", "--name-only", "HEAD"], git.projectRoot)
    || gitExec(["diff", "--name-only"], git.projectRoot)
    || "";
  const untracked = gitExec(["ls-files", "--others", "--exclude-standard"], git.projectRoot) || "";
  return Object.freeze(unique(
    (tracked + "\n" + untracked)
      .split(/\r?\n/gu)
      .map((value) => value.trim())
      .filter(Boolean)
  ).sort());
}

function detectStack(workspacePath) {
  const root = resolveGitContext(workspacePath).projectRoot;
  const stacks = new Set();
  const exists = (relative) => fs.existsSync(path.join(root, relative));

  const packageJson = readJson(path.join(root, "package.json"));
  if (packageJson) {
    stacks.add("node");
    const deps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    };
    if (deps.react || deps["react-dom"]) stacks.add("react");
    if (deps.next) stacks.add("next");
    if (deps.vue) stacks.add("vue");
    if (deps.nuxt) stacks.add("nuxt");
    if (deps["@angular/core"]) stacks.add("angular");
    if (deps.svelte || deps["@sveltejs/kit"]) stacks.add("svelte");
    if (deps.astro) stacks.add("astro");
    if (deps["@nestjs/core"]) stacks.add("nestjs");
    if (deps.express) stacks.add("express");
    if (deps.prisma || deps["@prisma/client"]) stacks.add("prisma");
  }

  if (exists("go.mod") || exists("go.work")) stacks.add("go");
  if (exists("pom.xml")) { stacks.add("java"); stacks.add("maven"); }
  if (exists("build.gradle") || exists("build.gradle.kts") || exists("settings.gradle") || exists("settings.gradle.kts")) {
    stacks.add("java");
    stacks.add("gradle");
  }
  if (fs.readdirSync(root, { withFileTypes: true }).some((entry) => entry.isFile() && /\.(?:sln|csproj)$/iu.test(entry.name))) stacks.add("dotnet");
  if (exists("pyproject.toml") || exists("requirements.txt") || exists("Pipfile")) stacks.add("python");
  if (exists("composer.json")) stacks.add("php");
  if (exists("Gemfile")) stacks.add("ruby");
  if (exists("Cargo.toml")) stacks.add("rust");
  if (exists("Dockerfile") || exists("docker-compose.yml") || exists("docker-compose.yaml") || exists("compose.yml") || exists("compose.yaml")) stacks.add("docker");
  if (exists(".github/workflows")) stacks.add("github-actions");
  if (exists(".gitlab-ci.yml") || exists(".gitlab-ci.yaml")) stacks.add("gitlab-ci");
  if (["k8s", "kubernetes", "helm", "charts"].some(exists)) stacks.add("kubernetes");

  return Object.freeze([...stacks].sort());
}

function capabilitiesFromStack(stack = []) {
  return Object.freeze(unique(
    stack.flatMap((item) => STACK_CAPABILITY_MAP[String(item).toLocaleLowerCase("en-US")] || [])
  ).sort());
}

function capabilitiesFromFiles(files = []) {
  const capabilities = [];
  for (const file of files) {
    for (const rule of FILE_CAPABILITY_RULES) {
      if (rule.pattern.test(String(file))) capabilities.push(...rule.capabilities);
    }
  }
  return Object.freeze(unique(capabilities).sort());
}

function verifiedMemorySkillHints(memory, gitContext, intent) {
  if (!memory || typeof memory.search !== "function" || !gitContext?.repositoryId || !intent) {
    return Object.freeze([]);
  }
  try {
    const observations = memory.search(gitContext.repositoryId, {
      verified: true,
      search: intent,
      branch: gitContext.branch || undefined
    }).slice(0, 20);
    const hints = [];
    for (const observation of observations) {
      for (const tag of observation.tags || []) {
        const normalized = String(tag).trim();
        if (/^skill-[a-z0-9-]+$/u.test(normalized)) hints.push(normalized);
        const prefixed = normalized.match(/^skill:(skill-[a-z0-9-]+)$/u);
        if (prefixed) hints.push(prefixed[1]);
      }
    }
    return Object.freeze(unique(hints).sort());
  } catch {
    return Object.freeze([]);
  }
}

function collectRoutingSignals(workspacePath, { intent, memory } = {}) {
  const gitContext = resolveGitContext(workspacePath);
  const changedFiles = resolveChangedFiles(gitContext.projectRoot);
  const stack = detectStack(gitContext.projectRoot);
  return Object.freeze({
    gitContext: Object.freeze({
      repositoryId: gitContext.repositoryId,
      branch: gitContext.branch,
      vcs: gitContext.vcs
    }),
    changedFiles,
    stack,
    stackCapabilities: capabilitiesFromStack(stack),
    scopeCapabilities: capabilitiesFromFiles(changedFiles),
    memorySkillHints: verifiedMemorySkillHints(memory, gitContext, intent)
  });
}

module.exports = {
  FILE_CAPABILITY_RULES,
  STACK_CAPABILITY_MAP,
  capabilitiesFromFiles,
  capabilitiesFromStack,
  collectRoutingSignals,
  detectStack,
  resolveChangedFiles,
  verifiedMemorySkillHints
};
