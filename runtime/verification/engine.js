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

// Parse a shell command string into argv, respecting single/double quotes.
// Used to avoid shell:true (which allows injection via metacharacters).
function parseShellCommand(command) {
  const tokens = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let hasToken = false;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else current += ch;
    } else if (inDouble) {
      if (ch === '"') inDouble = false;
      else if (ch === "\\" && i + 1 < command.length && command[i + 1] === '"') { current += '"'; i += 1; }
      else current += ch;
    } else if (ch === "'") { inSingle = true; hasToken = true; }
    else if (ch === '"') { inDouble = true; hasToken = true; }
    else if (/\s/.test(ch)) {
      if (hasToken || current) { tokens.push(current); current = ""; hasToken = false; }
    } else current += ch;
  }
  if (hasToken || current) tokens.push(current);
  return tokens;
}

function runCommand(command, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const denial = isDeniedCommand(command);
    if (denial) {
      resolve({ exitCode: 1, stdout: "", stderr: `Denied by ${denial.rule}: ${denial.description}`, durationMs: Date.now() - startedAt, timedOut: false, denied: denial.rule });
      return;
    }
    const MAX_OUTPUT = 512 * 1024;
    // Always use shell:false to prevent injection. Parse into argv manually.
    const argv = parseShellCommand(command);
    if (argv.length === 0) {
      resolve({ exitCode: 1, stdout: "", stderr: "Empty command", durationMs: Date.now() - startedAt, timedOut: false, error: "Empty command" });
      return;
    }
    let spawnCommand = argv[0];
    let spawnArgs = argv.slice(1);
    // CreateProcess does not execute .cmd/.bat files directly with shell:false.
    // Only the fixed npm run <safe-script> form may use cmd.exe; never pass an
    // arbitrary parsed command line into cmd.exe (metacharacter injection).
    if (process.platform === "win32") {
      const basename = path.win32.basename(spawnCommand).toLowerCase();
      if (basename === "npm" || basename === "npm.cmd") {
        if (spawnArgs.length !== 2 || spawnArgs[0] !== "run" || !SAFE_SCRIPT_NAMES.has(spawnArgs[1])) {
          resolve({ exitCode: 1, stdout: "", stderr: "Unsupported npm invocation on Windows", durationMs: Date.now() - startedAt, timedOut: false });
          return;
        }
        const script = spawnArgs[1]; // allowlisted identifier; no untrusted quoting
        spawnCommand = "cmd.exe";
        spawnArgs = ["/d", "/s", "/c", "npm.cmd run " + script];
      } else if (/\\.(?:cmd|bat)$/iu.test(basename)) {
        resolve({ exitCode: 1, stdout: "", stderr: "Batch shims are not permitted in verification commands", durationMs: Date.now() - startedAt, timedOut: false });
        return;
      }
    }
    let child;
    try {
      child = spawn(spawnCommand, spawnArgs, { cwd: options.cwd, shell: false, windowsHide: true });
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
