"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function findPowerShell() {
  for (const command of ["pwsh", "powershell"]) {
    const probe = spawnSync(command, ["-NoProfile", "-Command", "$true"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) return command;
  }
  return null;
}

function runInstaller(home, {
  directory = "scripts",
  force = false,
  skipSkillSync = false,
  nonInteractive = true,
  only = [],
  env = process.env,
  ...options
} = {}) {
  if (process.platform === "win32") {
    const powershell = findPowerShell();
    if (!powershell) throw new Error("PowerShell is required for Windows installer tests.");
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, directory, "install.ps1"), "-HomePath", home];
    if (force) args.push("-Force");
    if (skipSkillSync) args.push("-SkipSkillSync");
    if (nonInteractive) args.push("-NonInteractive");
    if (only.length > 0) args.push("-Only", only.join(","));
    return spawnSync(powershell, args, {
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
        HOME: home,
        USERPROFILE: home,
        CODEX_HOME: path.join(home, ".codex"),
        ORQUESTRADOR_ALLOW_ROOT_INSTALL: "1",
      },
      ...options,
    });
  }

  const args = [path.join(ROOT, directory, "install.sh"), "--home-path", home];
  if (force) args.push("--force");
  if (skipSkillSync) args.push("--skip-skill-sync");
  if (nonInteractive) args.push("--non-interactive");
  if (only.length > 0) args.push("--only", only.join(","));
  return spawnSync("bash", args, { encoding: "utf8", env, ...options });
}

function runVerifier(home, { directory = "scripts", skipToolProfiles = false, strict = false, env = process.env, ...options } = {}) {
  if (process.platform === "win32") {
    const powershell = findPowerShell();
    if (!powershell) throw new Error("PowerShell is required for Windows verification tests.");
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, directory, "verify-install.ps1"), "-HomePath", home];
    if (skipToolProfiles) args.push("-SkipToolProfiles");
    if (strict) args.push("-Strict");
    return spawnSync(powershell, args, {
      encoding: "utf8",
      env: { ...process.env, ...env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, ".codex") },
      ...options,
    });
  }

  const args = [path.join(ROOT, directory, "verify-install.sh"), "--home-path", home];
  if (skipToolProfiles) args.push("--skip-tool-profiles");
  if (strict) args.push("--strict");
  return spawnSync("bash", args, { encoding: "utf8", env, ...options });
}

function runSkillSync(scriptPath, home, { only, apply = true, env = process.env, ...options } = {}) {
  if (process.platform === "win32") {
    const powershell = findPowerShell();
    if (!powershell) throw new Error("PowerShell is required for Windows skill-sync tests.");
    const psScriptPath = scriptPath.replace(/\.sh$/u, ".ps1");
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScriptPath];
    if (apply) args.push("-Apply");
    args.push("-HomePath", home);
    if (only) args.push("-Only", only);
    return spawnSync(powershell, args, {
      encoding: "utf8",
      env: { ...process.env, ...env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, ".codex") },
      ...options,
    });
  }

  const args = [scriptPath];
  if (apply) args.push("--apply");
  args.push("--home-path", home);
  if (only) args.push("--only", only);
  return spawnSync("bash", args, { encoding: "utf8", env, ...options });
}

module.exports = {
  makeTempDir,
  writeFile,
  findPowerShell,
  runInstaller,
  runVerifier,
  runSkillSync,
};
