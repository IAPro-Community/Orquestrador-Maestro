"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const { createVerification, createVerificationCheck } = require("../core");
const { isDeniedCommand } = require("../governance/policy-enforcer");

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
    // 1.1.0 (SEC-03): deterministic deny policy before spawn. Prompt-level
    // bans are advisory; this never executes a denied command.
    const denial = isDeniedCommand(command);
    if (denial) {
      resolve({ exitCode: 1, stdout: "", stderr: `Denied by ${denial.rule}: ${denial.description}`, durationMs: Date.now() - startedAt, timedOut: false, denied: denial.rule });
      return;
    }
    const MAX_OUTPUT = 512 * 1024;
    let spawnCommand = command;
    let spawnArgs;
    if (process.platform === "win32") {
      const nodeEval = command.match(/^\s*(.+?)\s+-e\s+\\?"([\s\S]*?)\\?"\s*$/u);
      if (nodeEval) {
        spawnCommand = nodeEval[1].replace(/^"|"$/gu, "");
        spawnArgs = ["-e", nodeEval[2]];
      }
    }
    let child;
    try {
      child = spawn(spawnCommand, spawnArgs, { cwd: options.cwd, shell: !spawnArgs, windowsHide: true });
    } catch (error) {
      resolve({ exitCode: 1, stdout: "", stderr: String((error && error.message) || error), durationMs: Date.now() - startedAt, timedOut: false, error: String((error && error.message) || error) });
      return;
    }
    const append = (store, chunk) => {
      const next = store.value + chunk;
      store.value = next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next;
      store.truncated = store.truncated || next.length >= MAX_OUTPUT;
    };
    const out = { value: "", truncated: false };
    const err = { value: "", truncated: false };
    let timedOut = false;
    let settled = false;
    const killTimer = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { if (!settled) child.kill("SIGKILL"); } catch {} }, 2000);
    }, options.timeoutMs) : null;
    const done = (result) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
    };
    if (child.stdout) child.stdout.on("data", (chunk) => append(out, String(chunk)));
    if (child.stderr) child.stderr.on("data", (chunk) => append(err, String(chunk)));
    child.on("error", (error) => { done({ exitCode: 1, stdout: out.value, stderr: err.value + String((error && error.message) || error), durationMs: Date.now() - startedAt, timedOut, truncated: out.truncated || err.truncated, error: String((error && error.message) || error) }); });
    child.on("close", (code) => {
      done({ exitCode: Number.isInteger(code) ? code : 1, stdout: out.value, stderr: err.value, durationMs: Date.now() - startedAt, timedOut, truncated: out.truncated || err.truncated });
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
