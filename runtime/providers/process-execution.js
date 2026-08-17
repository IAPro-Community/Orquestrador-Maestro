"use strict";

const { spawn } = require("node:child_process");

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

function safeEnvironment(environment) {
  if (environment === undefined) return process.env;
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("execution request.environment must be an object");
  }
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value !== "string") {
      throw new TypeError(`execution request.environment.${key} must be a string`);
    }
  }
  return { ...process.env, ...environment };
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
  const child = spawn(executable, commandArgs, {
    cwd: request.workspacePath,
    env: safeEnvironment(request.environment),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let cancelled = false;
  let timedOut = false;
  let settled = false;
  let timeout;
  let resolveResult;

  const result = new Promise((resolve) => {
    resolveResult = resolve;
  });
  const finish = (partial) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
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
    emit(request.onEvent, "provider.completed", { providerId, result: completed });
    resolveResult(completed);
  };

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stdout += text;
    emit(request.onEvent, "provider.output", { providerId, stream: "stdout", chunk: text });
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    stderr += text;
    emit(request.onEvent, "provider.output", { providerId, stream: "stderr", chunk: text });
  });
  child.once("error", (error) => finish({ exitCode: null, signal: null, error: error.message }));
  child.once("close", (exitCode, signal) => finish({ exitCode, signal, error: undefined }));

  if (timeoutMs) {
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
  }

  emit(request.onEvent, "provider.started", { providerId, pid: child.pid, command: executable, args: Object.freeze([...commandArgs]) });
  return Object.freeze({
    providerId,
    pid: child.pid,
    result,
    cancel() {
      if (!settled) {
        cancelled = true;
        child.kill("SIGTERM");
      }
    }
  });
}

function detectExecutable({ executable, args = [], providerId }) {
  return new Promise((resolve) => {
    const child = spawn(executable, [...args, "--version"], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => resolve(Object.freeze({ id: providerId, installed: false, executable, error: error.message })));
    child.once("close", (exitCode) => resolve(Object.freeze({
      id: providerId,
      installed: exitCode === 0,
      executable,
      version: exitCode === 0 ? (stdout.trim() || stderr.trim() || undefined) : undefined,
      error: exitCode === 0 ? undefined : (stderr.trim() || `exit code ${exitCode}`)
    })));
  });
}

module.exports = { detectExecutable, startProcess };
