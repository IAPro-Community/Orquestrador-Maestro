"use strict";

// 1.1.0: doctor.ps1 --strict regression.
// Historically --strict failed unconditionally (Status field does not exist on
// routing/mirror objects) and, after that fix, failed on 300+ false positives
// because non-mirrorEverywhere skills are legitimately absent from some roots.
// Contract:
//   - healthy install + --Strict  => exit 0
//   - corrupted mirror + --Strict  => exit 1 (real drift)
//   - any run without --Strict     => exit 0 (JSON report only)
// Skipped when PowerShell is unavailable (pwsh is optional by design).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const DOCTOR = path.join(ROOT, "orquestrador", "doctor.ps1");
const bashFlavor = spawnSync("bash", ["-lc", "uname -s"], { encoding: "utf8" }).stdout?.trim() || "";
const bashPath = (value) => {
  const absolute = path.resolve(value).replace(/\\/g, "/");
  return absolute.replace(/^([A-Za-z]):\/(.*)$/u, (_match, drive, rest) =>
    bashFlavor.startsWith("MINGW") || bashFlavor.startsWith("MSYS")
      ? `/${drive.toLowerCase()}/${rest}`
      : `/mnt/${drive.toLowerCase()}/${rest}`);
};

function hasPowerShell() {
  for (const cmd of ["pwsh", "powershell"]) {
    const probe = spawnSync(cmd, ["-NoProfile", "-Command", "$true"], { stdio: "ignore", shell: false });
    if (!probe.error && probe.status === 0) return cmd;
  }
  return null;
}

const PS = hasPowerShell();

function freshInstall() {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "maestro-doctor-")), "h");
  fs.mkdirSync(home, { recursive: true });
  const install = spawnSync("bash", [bashPath(path.join(ROOT, "install.sh")), "--home-path", bashPath(home), "--non-interactive"], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: path.join(home, ".codex") },
  });
  assert.equal(install.status, 0, `install failed: ${install.stderr?.slice(0, 800)}`);
  return home;
}

function runDoctor(home, strict) {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", DOCTOR, "-HomePath", home];
  if (strict) args.push("-Strict");
  return spawnSync(PS, args, { encoding: "utf8", env: { ...process.env, CODEX_HOME: path.join(home, ".codex") } });
}

test("doctor --strict passes on a healthy install", { skip: PS ? false : "pwsh not available" }, () => {
  const home = freshInstall();
  const res = runDoctor(home, true);
  assert.equal(res.status, 0, `--strict must not fail on a healthy install:\n${res.stderr?.slice(0, 800)}`);
});

test("doctor --strict fails on a corrupted mirror", { skip: PS ? false : "pwsh not available" }, () => {
  const home = freshInstall();
  const mirrored = path.join(home, ".agents", "skills", "skill-adr", "SKILL.md");
  assert.ok(fs.existsSync(mirrored), "expected a mirrored canonical skill to exist");
  fs.appendFileSync(mirrored, "\nCORRUPTION\n");
  const res = runDoctor(home, true);
  assert.equal(res.status, 1, `--strict must fail on real mirror drift:\n${res.stdout?.slice(0, 400)}`);
});

test("doctor without --strict never fails the process", { skip: PS ? false : "pwsh not available" }, () => {
  const home = freshInstall();
  const res = runDoctor(home, false);
  assert.equal(res.status, 0, `doctor must always exit 0 without --Strict:\n${res.stderr?.slice(0, 800)}`);
});

test("doctor --strict detects missing deprecated aliases in native roots", { skip: PS ? false : "pwsh not available" }, () => {
  const home = freshInstall();
  const missingAlias = path.join(home, ".claude", "skills", "skill-open-code-review");
  assert.ok(fs.existsSync(path.join(missingAlias, "SKILL.md")), "install should create the deprecated compatibility alias");
  fs.rmSync(missingAlias, { recursive: true, force: true });
  const res = runDoctor(home, true);
  assert.equal(res.status, 1, `--strict must detect the missing alias:\n${res.stdout?.slice(0, 800)}`);
  assert.match(res.stderr + res.stdout, /unhealthy roots/);
});

test("doctor --strict detects managed core edits but allows preserved custom files", { skip: PS ? false : "pwsh not available" }, () => {
  const home = freshInstall();
  const customSkill = path.join(home, ".agents", "skills", "minha-skill");
  fs.mkdirSync(customSkill, { recursive: true });
  fs.writeFileSync(path.join(customSkill, "SKILL.md"), "---\nname: minha-skill\ndescription: custom\n---\n", "utf8");

  const mirroredSkill = path.join(home, ".claude", "skills", "skill-adr");
  const mirroredSkillFile = path.join(mirroredSkill, "SKILL.md");
  assert.ok(fs.existsSync(mirroredSkillFile), "full install should mirror skill-adr into Claude");
  fs.appendFileSync(mirroredSkillFile, "\nuser customization\n");
  fs.writeFileSync(path.join(mirroredSkill, "private-notes.md"), "keep these notes\n", "utf8");
  const sync = spawnSync("bash", [
    bashPath(path.join(home, ".orquestrador", "sync-skills.sh")),
    "--apply", "--home-path", bashPath(home), "--only", "claude",
  ], { encoding: "utf8", env: { ...process.env, CODEX_HOME: path.join(home, ".codex") } });
  assert.equal(sync.status, 0, `sync should preserve customized official skills:\n${sync.stderr?.slice(0, 800)}`);
  assert.match(fs.readFileSync(mirroredSkillFile, "utf8"), /user customization/);
  assert.equal(fs.readFileSync(path.join(mirroredSkill, "private-notes.md"), "utf8"), "keep these notes\n");

  const healthy = runDoctor(home, true);
  assert.equal(healthy.status, 0, `a recognized native skill customization must not be treated as loss:\n${healthy.stderr?.slice(0, 800)}`);

  fs.appendFileSync(path.join(home, ".orquestrador", "rules.md"), "\nuser modification\n");
  const drifted = runDoctor(home, true);
  assert.equal(drifted.status, 1, `--strict must detect untracked managed-file edits:\n${drifted.stdout?.slice(0, 800)}`);
  assert.match(drifted.stderr + drifted.stdout, /managed-files unhealthy=True/i);
});
