#!/usr/bin/env node
"use strict";

// 1.1.0 (PORT-04): portable `npm run validate` dispatcher.
// - With PowerShell available (Windows, or pwsh on POSIX): run the full
//   .ps1 chain (public sanitization + skills), same as before.
// - Without PowerShell (minimal Linux/macOS containers): run the JSON-only
//   contract subset explicitly in degraded mode (exit 0 when it passes,
//   with a visible DEGRADED marker so CI logs stay honest).

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: false });
  return !result.error && result.status === 0;
}

function runNode(script, scriptArgs = []) {
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts", script), ...scriptArgs], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false
  });
  if (result.error) throw result.error;
  return typeof result.status === "number" ? result.status : 1;
}

function runPowerShell(script) {
  const ps = process.platform === "win32" ? "powershell" : null;
  const candidates = ps ? [ps] : ["pwsh", "powershell"];
  for (const command of candidates) {
    try {
      const result = spawnSync(command, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(rootDir, "scripts", script)], {
        cwd: rootDir,
        stdio: "inherit",
        shell: false
      });
      if (result.error && result.error.code === "ENOENT") continue;
      return typeof result.status === "number" ? result.status : 1;
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

function main() {
  const hasPowerShell = process.platform === "win32"
    || commandAvailable("pwsh", ["-NoProfile", "-Command", "$true"])
    || commandAvailable("powershell", ["-NoProfile", "-Command", "$true"]);

  if (hasPowerShell) {
    let code = runPowerShell("validate-public.ps1");
    if (code !== 0) process.exit(code);
    code = runPowerShell("validate-skills.ps1");
    process.exit(code);
  }

  console.log("validate: DEGRADED mode (no PowerShell) — running JSON-only contract subset.");
  let code = runNode("public-skill-catalog.js", ["check"]);
  if (code !== 0) process.exit(code);
  code = runNode("skill-catalog.js", ["validate"]);
  if (code !== 0) process.exit(code);
  code = runNode("skill-catalog.js", ["check"]);
  process.exit(code);
}

try {
  main();
} catch (error) {
  console.error(`validate failed: ${(error && error.message) || error}`);
  process.exit(1);
}
