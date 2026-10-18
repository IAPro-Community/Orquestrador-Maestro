"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runInstaller, runVerifier } = require("./test-helpers.js");

const ROOT = path.resolve(__dirname, "..");

test("1.1.0: deprecated open-code aliases exist as shims with redirect", () => {
  for (const [skill, redirect] of [
    ["skill-open-code-review", "code-review"],
    ["skill-open-code-delegate", "skill-multiagent-orchestration"],
  ]) {
    const p = path.join(ROOT, "orquestrador", "skills", skill, "SKILL.md");
    assert.ok(fs.existsSync(p), `${skill} shim must exist`);
    const body = fs.readFileSync(p, "utf8");
    assert.match(body, /deprecated/i);
    assert.match(body, new RegExp(redirect.replace(/-/g, "-")));
  }
});

test("1.1.0: manifest + router register deprecated aliases", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILLS_MANIFEST.json"), "utf8"));
  const router = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILLS_ROUTER.json"), "utf8"));
  for (const skill of ["skill-open-code-review", "skill-open-code-delegate"]) {
    assert.ok(manifest.skills[skill], `manifest must contain ${skill}`);
    assert.equal(manifest.skills[skill].deprecated, true);
    assert.ok(manifest.skills[skill].redirect, `${skill} must have redirect`);
    assert.equal(manifest.skills[skill].mirrorEverywhere, false);
    assert.ok(router.skills[skill], `router must contain ${skill}`);
    assert.equal(router.skills[skill].deprecated, true);
  }
  assert.equal(manifest.skills["skill-open-code-review"].redirect, "code-review");
  assert.equal(manifest.skills["skill-open-code-delegate"].redirect, "skill-multiagent-orchestration");
});

test("1.1.0: redirect targets are real packaged skills", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "codex", "skills", "code-review", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(ROOT, "orquestrador", "skills", "skill-multiagent-orchestration", "SKILL.md")));
});

test("1.1.0 (#38): both deprecated aliases install into every authorized native root", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-alias-roots-"));
  const install = runInstaller(home, { force: true });
  assert.equal(install.status, 0, `installer failed: ${install.stderr?.slice(0, 2000)}`);

  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILL_INSTALL_POLICY.json"), "utf8"));
  const aliases = ["skill-open-code-review", "skill-open-code-delegate"];
  for (const [program, rule] of Object.entries(policy.nativeRoots)) {
    for (const alias of aliases) {
      assert.ok(rule.allowDirectories.includes(alias), `${alias} must be authorized in ${program}`);
      assert.ok(fs.existsSync(path.join(home, rule.path, alias, "SKILL.md")), `${alias} must be installed in ${program}`);
    }
  }
});

test("1.1.0 (#39): verify --strict detects a missing deprecated alias in an authorized root", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-alias-verify-"));
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: path.join(home, ".codex"),
  };
  const install = runInstaller(home, { force: true, env });
  assert.equal(install.status, 0, `installer failed: ${install.stderr?.slice(0, 1500)}`);

  const verify = () => runVerifier(home, { skipToolProfiles: true, strict: true, env });
  const healthy = verify();
  assert.equal(healthy.status, 0, `strict verification should pass after install:\n${healthy.stderr?.slice(0, 1200)}\n${healthy.stdout?.slice(0, 1200)}`);

  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "orquestrador", "SKILL_INSTALL_POLICY.json"), "utf8"));
  const missing = path.join(home, policy.nativeRoots.claude.path, "skill-open-code-review");
  fs.rmSync(missing, { recursive: true, force: true });
  const broken = verify();
  assert.notEqual(broken.status, 0, "strict verification must reject a removed compatibility alias");
  assert.match(broken.stderr + broken.stdout, /skill-open-code-review/);
});
