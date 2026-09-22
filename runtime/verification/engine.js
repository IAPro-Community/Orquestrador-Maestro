"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { createVerification, createVerificationCheck } = require("../core");
const { sanitizeDiagnostic } = require("../telemetry/diagnostic-sanitizer");

const SAFE_SCRIPT_NAMES = new Set(["lint", "typecheck", "test", "tests", "build"]);

function inferCommands(packageJson) {
  const scripts = packageJson && packageJson.scripts ? packageJson.scripts : {};
  return Object.entries(scripts)
    .filter(([name]) => SAFE_SCRIPT_NAMES.has(name))
    .map(([name]) => ({ name, command: `npm run ${name}` }));
}

function runCommand(command, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let spawnCommand = command;
    let spawnArgs;
    if (process.platform === "win32") {
      const nodeEval = command.match(/^\s*(.+?)\s+-e\s+\\?"([\s\S]*?)\\?"\s*$/u);
      if (nodeEval) {
        spawnCommand = nodeEval[1].replace(/^"|"$/gu, "");
        spawnArgs = ["-e", nodeEval[2]];
      }
    }
    const child = spawn(spawnCommand, spawnArgs, { cwd: options.cwd, shell: !spawnArgs, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timeout = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs) : null;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { stderr += error.message; if (!settled) { settled = true; if (timeout) clearTimeout(timeout); resolve({ exitCode: 1, stdout, stderr, durationMs: Date.now() - startedAt, timedOut, error: error.message }); } });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve({ exitCode: Number.isInteger(code) ? code : 1, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
  });
}

function pathLikeNode(value) {
  return typeof value === "string" && /(?:^|[\\/])node(?:\.exe)?$/iu.test(value);
}

class VerificationEngine {
  async verify({ id, runId, commands, cwd, timeoutMs }) {
    const checks = [];
    for (const entry of commands || []) {
      const result = await runCommand(entry.command, { cwd, timeoutMs: entry.timeoutMs || timeoutMs });
      checks.push(createVerificationCheck({
        name: entry.name,
        command: sanitizeDiagnostic(entry.command, { maxChars: 2000 }),
        exitCode: result.exitCode,
        stdout: sanitizeDiagnostic(result.stdout || "", { maxChars: 8000 }),
        stderr: sanitizeDiagnostic(result.stderr || "", { maxChars: 8000 }),
        durationMs: result.durationMs
      }));
    }
    return createVerification({
      id,
      runId,
      status: checks.length === 0 ? "skipped" : checks.some((check) => check.exitCode !== 0) ? "failed" : "passed",
      checks,
      completedAt: new Date().toISOString()
    });
  }
}

module.exports = { VerificationEngine, inferCommands, runCommand };
