"use strict";

const { spawn } = require("node:child_process");
const { ownProcessGroup, signalManagedProcess } = require("./managed-process");
const { isDeniedCommand } = require("../governance/policy-enforcer");

function requiredPrompt(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("execution request must be an object");
  }
  if (typeof request.prompt !== "string" || request.prompt.trim() === "") {
    throw new TypeError("execution request.prompt must be a non-empty string");
  }
  return request.prompt;
}

function optionalPositiveInteger(value, name) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

const BLOCKED_ENV_KEYS = new Set(["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH", "NODE_OPTIONS", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_ACCESS_KEY_ID", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_TOKEN", "BASH_ENV", "PYTHONPATH", "AZURE_OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"]);
const BLOCKED_ENV_PREFIXES = ["MAESTRO_ADAPTIVE_", "MAESTRO_BENCHMARK_", "BENCHMARK_ADAPTIVE_"];

function safeEnvironment(environment) {
  if (environment !== undefined) {
    if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
      throw new TypeError("execution request.environment must be an object");
    }
    for (const [key, value] of Object.entries(environment)) {
      if (typeof value !== "string") {
        throw new TypeError(`execution request.environment.${key} must be a string`);
      }
    }
  }
  const env = { ...process.env, ...(environment || {}) };
  for (const key of BLOCKED_ENV_KEYS) delete env[key];
  for (const key of Object.keys(env)) {
    const normalized = key.toUpperCase();
    if (BLOCKED_ENV_KEYS.has(normalized) || BLOCKED_ENV_PREFIXES.some(prefix => normalized.startsWith(prefix)) || /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIALS?)(?:_|$)/.test(normalized)) delete env[key];
  }
  return env;
}

function emit(onEvent, type, data) {
  if (typeof onEvent === "function") {
    onEvent(Object.freeze({ type, occurredAt: new Date().toISOString(), ...data }));
  }
}

function startProcess({ executable, args, request, providerId }) {
  const prompt = requiredPrompt(request);
  const timeoutMs = optionalPositiveInteger(request.timeoutMs, "execution request.timeoutMs");
  const startedAt = Date.now();
  const commandArgs = [...args, prompt];
  // Deterministic deny policy on the provider spawn path. Previously the deny
  // rules only guarded post-run verification commands, so a provider CLI could
  // still be launched with a denied git/rm/pipe-to-shell invocation in its args.
  // The prompt is deliberately NOT scanned: it is model-authored task content,
  // not an operator-authored command line.
  const denial = isDeniedCommand([executable, ...args].join(" "));
  if (denial) {
    const error = new Error(`Denied by ${denial.rule}: ${denial.description}`);
    error.code = "POLICY_DENIED";
    error.rule = denial.rule;
    throw error;
  }
  const child = spawn(executable, commandArgs, {
    cwd: request.workspacePath,
    env: safeEnvironment(request.environment),
    shell: false,
    detached: ownProcessGroup,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let cancelled = false;
  let timedOut = false;
  let settled = false;
  let timeout;
  let escalation;
  let terminationDeadline;
  let resolveResult;

  const result = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const finish = (partial) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    if (escalation) clearTimeout(escalation);
    if (terminationDeadline) clearTimeout(terminationDeadline);
    if ((timedOut || cancelled) && ownProcessGroup) signalManagedProcess(child, "SIGKILL");
    const completed = Object.freeze({
      providerId,
      pid: child.pid,
      command: executable,
      args: Object.freeze([...commandArgs]),
      stdout,
      stderr,
      cancelled,
      timedOut,
      durationMs: Date.now() - startedAt,
      ...partial
    });
    // Durable vs ephemeral split: the full result (stdout/stderr/args with
    // prompt) stays in memory for parsers/UI subscribers. The persisted
    // lifecycle event carries only a sanitized summary (no prompt, no raw
    // output). See MaestroApplication.record() ephemeral routing.
    emit(request.onEvent, "provider.completed", {
      providerId,
      pid: child.pid,
      command: executable,
      exitCode: completed.exitCode ?? null,
      signal: completed.signal ?? null,
      cancelled,
      timedOut,
      durationMs: completed.durationMs,
      ...(completed.error ? { error: completed.error } : {})
    });
    resolveResult(completed);
  };

  const MAX_OUTPUT = 512 * 1024;
  const truncate = (store, text) => {
    const next = store + text;
    return next.length > MAX_OUTPUT ? next.slice(-MAX_OUTPUT) : next;
  };

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stdout = truncate(stdout, text);
    emit(request.onEvent, "provider.output", { providerId, stream: "stdout", chunk: text });
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stderr = truncate(stderr, text);
    emit(request.onEvent, "provider.output", { providerId, stream: "stderr", chunk: text });
  });
  child.once("error", (error) => finish({ exitCode: null, signal: null, error: error.message }));
  child.once("close", (exitCode, signal) => finish({ exitCode, signal, error: undefined }));

  function terminate() {
    if (settled || escalation) return;
    if (ownProcessGroup) signalManagedProcess(child, "SIGTERM");
    else signalManagedProcess(child, "SIGKILL");
    escalation = setTimeout(() => { if (!settled) signalManagedProcess(child, "SIGKILL"); }, 2000);
    terminationDeadline = setTimeout(() => {
      if (settled) return;
      child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
      finish({exitCode:null,signal:null,terminationUncertain:true,error:"PROCESS_TERMINATION_UNCERTAIN"});
    }, 7000);
  }
  if (timeoutMs) {
    timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
  }

  emit(request.onEvent, "provider.started", { providerId, pid: child.pid, command: executable });
  return Object.freeze({
    providerId,
    pid: child.pid,
    result,
    cancel() {
      if (!settled) {
        cancelled = true;
        terminate();
      }
    }
  });
}

function detectExecutable({ executable, args = [], providerId, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(executable, [...args, "--version"], { shell: false, detached: ownProcessGroup, env: safeEnvironment(), stdio: ["ignore", "pipe", "pipe"] }); }
    catch { resolve(Object.freeze({id:providerId,installed:false,executable,error:"DETECTION_SPAWN_FAILED"})); return; }
    let stdout = "", stderr = "", settled = false;
    const done = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Object.freeze({id:providerId,executable,...result}));
    };
    const timer = setTimeout(() => {
      signalManagedProcess(child, "SIGKILL");
      child.stdout?.destroy(); child.stderr?.destroy(); child.unref();
      done({installed:false,error:"DETECTION_TIMEOUT"});
    }, timeoutMs);
    child.stdout.on("data", chunk => { stdout = (stdout + chunk.toString("utf8")).slice(-8192); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString("utf8")).slice(-8192); });
    child.once("error", () => done({installed:false,error:"DETECTION_SPAWN_FAILED"}));
    child.once("close", exitCode => done({installed:exitCode===0,version:exitCode===0?(stdout.trim()||stderr.trim()||undefined):undefined,error:exitCode===0?undefined:"DETECTION_EXIT_"+exitCode}));
  });
}

module.exports = { detectExecutable, startProcess, safeEnvironment };
