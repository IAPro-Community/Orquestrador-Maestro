"use strict";

const { spawn } = require("node:child_process");
const { createVerification, createVerificationCheck } = require("../core");

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
    const child = spawn(command, { cwd: options.cwd, shell: true, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs) : null;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { stderr += error.message; });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ exitCode: Number.isInteger(code) ? code : 1, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
  });
}

class VerificationEngine {
  async verify({ id, runId, commands, cwd, timeoutMs }) {
    const checks = [];
    for (const entry of commands || []) {
      const result = await runCommand(entry.command, { cwd, timeoutMs: entry.timeoutMs || timeoutMs });
      checks.push(createVerificationCheck({ name: entry.name, command: entry.command, ...result }));
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
