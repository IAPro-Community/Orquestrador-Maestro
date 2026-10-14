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
  const install = spawnSync("bash", [path.join(ROOT, "install.sh"), "--home-path", home, "--non-interactive"], { encoding: "utf8" });
  assert.equal(install.status, 0, `install failed: ${install.stderr?.slice(0, 800)}`);
  return home;
}

function runDoctor(home, strict) {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", DOCTOR, "-HomePath", home];
  if (strict) args.push("-Strict");
  return spawnSync(PS, args, { encoding: "utf8" });
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