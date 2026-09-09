"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function runCli(...args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("CLI legacy commands remain discoverable and reject unknown commands", () => {
  const help = runCli("--help");

  assert.equal(help.status, 0, help.stderr);
  for (const command of [
    "install", "update", "verify", "doctor", "init-dev", "compact-worklog",
    "check-dev-gates", "context brief", "run", "runs", "skills list",
    "providers list", "bridge --stdio", "uninstall", "list-targets", "dry-run",
    "telemetry", "version"
  ]) {
    assert.match(help.stdout, new RegExp(`orquestrador-maestro ${command.replace(" ", "\\s+")}`, "u"));
  }

  const version = runCli("version");
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /^\d+\.\d+\.\d+\s*$/u);

  const unknown = runCli("runtime-inexistente");
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Comando desconhecido/u);
});

test("legacy installer and verifier keep their explicit, non-destructive compatibility flags", () => {
  const installer = readText("install.sh");
  const verifier = readText("scripts/verify-install.sh");

  for (const flag of [
    "--home-path", "--core-only", "--no-tool-profiles", "--skip-community-skills",
    "--skip-skill-sync", "--only", "--dry-run", "--list-targets", "--uninstall"
  ]) {
    assert.match(installer, new RegExp(flag, "u"));
  }
  for (const flag of ["--home-path", "--core-only", "--skip-tool-profiles", "--verbose-paths"]) {
    assert.match(verifier, new RegExp(flag, "u"));
  }

  assert.match(installer, /ENGINE=.*scripts\/install\.sh/u);
  assert.match(installer, /--skip-extra-skills/u);
  assert.match(verifier, /SKILLS_ROUTER\.json/u);
  assert.match(verifier, /PERSISTENCE\.md/u);
});

test("doctor retains routing-health checks for the legacy registry and profiles", () => {
  const doctor = readText("orquestrador/doctor.ps1");

  for (const document of [
    "SKILLS_ROUTER.json", "SKILL_ALIASES.json", "SKILL_CHAINS.json",
    "SKILL_EXECUTION_PROFILES.json", "SKILL_USAGE_SCHEMA.json", "PROGRAM_ENTRYPOINTS.json"
  ]) {
    assert.match(doctor, new RegExp(document.replace(/[.]/gu, "\\."), "u"));
  }
  assert.match(doctor, /canonical-skill-unrouted/u);
  assert.match(doctor, /alias-bad-target/u);
  assert.match(doctor, /chain-bad-target/u);
  assert.match(doctor, /profile-bad-startSkill/u);
});

test("skill manifest, router, aliases, and chains preserve coherent public references", () => {
  const manifest = readJson("orquestrador/SKILLS_MANIFEST.json");
  const router = readJson("orquestrador/SKILLS_ROUTER.json");
  const aliases = readJson("orquestrador/SKILL_ALIASES.json");
  const chains = readJson("orquestrador/SKILL_CHAINS.json");

  assert.equal(manifest.schema, "./SKILLS_MANIFEST_SCHEMA.json");
  assert.equal(manifest.defaults.provenance.legacyCompatible, true);
  assert.equal(manifest.defaults.workflow.legacyCompatible, true);

  for (const skillId of Object.keys(manifest.skills)) {
    assert.ok(router.skills[skillId], `${skillId} must remain routable`);
    assert.ok(fs.existsSync(path.join(repoRoot, "orquestrador", "skills", skillId, "SKILL.md")), `${skillId} must retain its canonical skill file`);
  }
  for (const [alias, skillId] of Object.entries(aliases.aliases)) {
    assert.ok(router.skills[skillId], `alias ${alias} must target a routed skill`);
  }
  for (const [skillId, chain] of Object.entries(chains.chains)) {
    assert.ok(router.skills[skillId], `chain ${skillId} must start with a routed skill`);
    for (const target of chain.mayInvoke || []) {
      assert.ok(router.skills[target], `chain ${skillId} must only reference routed skills`);
    }
  }
  assert.equal(aliases.aliases.multiagent, "skill-multiagent-orchestration");
  assert.equal(chains.defaults.neverLoadFullCatalog, true);
});

test("update --help and update --version do not trigger self-update", () => {
  const helpResult = runCli("update", "--help");
  assert.equal(helpResult.status, 0, helpResult.stderr);
  assert.match(helpResult.stdout, /update/u);
  assert.match(helpResult.stdout, /Uso:/u, "update --help must show usage text, not trigger npm");
  assert.ok(!helpResult.stdout.includes("Atualizando a CLI"), "update --help must not start npm update process");

  const versionResult = runCli("update", "--version");
  assert.equal(versionResult.status, 0, versionResult.stderr);
  assert.match(versionResult.stdout, /^\d+\.\d+\.\d+\s*$/u);
  assert.ok(!versionResult.stdout.includes("Atualizando a CLI"), "update --version must not start npm update process");

  const shortVersionResult = runCli("update", "-v");
  assert.equal(shortVersionResult.status, 0, shortVersionResult.stderr);
  assert.match(shortVersionResult.stdout, /^\d+\.\d+\.\d+\s*$/u);
});

test("program entrypoints and tool profiles retain native integration contracts", () => {
  const entrypoints = readJson("orquestrador/PROGRAM_ENTRYPOINTS.json");
  const expectedProfiles = {
    codex: ["tool-profiles/codex/AGENTS.md"],
    claude: ["tool-profiles/claude/CLAUDE.md", "tool-profiles/claude/hooks.md"],
    opencode: ["tool-profiles/opencode-global/AGENTS.md", "tool-profiles/opencode/hooks.md"],
    cursor: ["tool-profiles/cursor/AGENTS.md", "tool-profiles/cursor/hooks.md"],
    gemini: ["tool-profiles/gemini/GEMINI.md", "tool-profiles/gemini/hooks.md"],
    windsurf: ["tool-profiles/windsurf-global/global_rules.md", "tool-profiles/windsurf/hooks.md"],
    antigravity: ["tool-profiles/antigravity/antigravity.json", "tool-profiles/antigravity/settings.json"]
  };

  assert.equal(entrypoints.version, 1);
  assert.match(entrypoints.principle, /native entrypoints stable/u);
  for (const [provider, profileFiles] of Object.entries(expectedProfiles)) {
    const program = entrypoints.programs[provider];
    assert.ok(program, `${provider} must remain an installed-program target`);
    assert.equal(program.component, provider);
    assert.ok(Array.isArray(program.primary) && program.primary.length > 0);
    assert.match(program.skillsRoot, /\{\{USER_HOME\}\}/u);
    for (const profileFile of profileFiles) {
      assert.ok(fs.existsSync(path.join(repoRoot, profileFile)), `${profileFile} must remain bundled`);
    }
  }

  for (const hookFile of [
    "tool-profiles/claude/hooks.md", "tool-profiles/opencode/hooks.md", "tool-profiles/cursor/hooks.md",
    "tool-profiles/gemini/hooks.md", "tool-profiles/windsurf/hooks.md"
  ]) {
    assert.match(readText(hookFile), /SKILLS_ROUTER\.json/u, `${hookFile} must keep compact skill routing`);
  }
});
