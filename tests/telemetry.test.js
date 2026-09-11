"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const test = require("node:test");
const { makeTempDir } = require("./test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

function telemetryHomeEnv(configHome) {
  return process.platform === "win32"
    ? { APPDATA: configHome, XDG_CONFIG_HOME: configHome }
    : { XDG_CONFIG_HOME: configHome };
}

function runCli(args, configHome, extraEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...telemetryHomeEnv(configHome), ...extraEnv }
  });
}

function runCliAsync(args, configHome, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...telemetryHomeEnv(configHome), ...extraEnv }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("telemetry status creates and persists an anonymous installation id without displaying it", () => {
  const configHome = makeTempDir("orquestrador-telemetry-");
  const first = runCli(["telemetry", "status"], configHome);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Telemetria: desabilitada/u);
  assert.doesNotMatch(first.stdout, /AnonymousId|Config:/u);

  const configPath = path.join(
    configHome,
    process.platform === "win32" ? "OrquestradorMaestro" : "orquestrador-maestro",
    "telemetry.json"
  );
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(config.enabled, false);
  assert.match(config.anonymousId, /^[0-9a-f-]{36}$/u);

  const second = runCli(["telemetry", "status"], configHome);
  const persisted = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(second.status, 0, second.stderr);
  assert.equal(persisted.anonymousId, config.anonymousId);
});

test("telemetry payload is minimal and does not include argument values or paths", async () => {
  const configHome = makeTempDir("orquestrador-telemetry-");
  const configDir = path.join(
    configHome,
    process.platform === "win32" ? "OrquestradorMaestro" : "orquestrador-maestro"
  );
  fs.mkdirSync(configDir, { recursive: true });
  const anonymousId = "test-anonymous-id-00000000-0000-0000-0000-000000000000";
  fs.writeFileSync(path.join(configDir, "telemetry.json"), JSON.stringify({
    enabled: true,
    anonymousId,
    endpoint: "",
    provider: "posthog",
    consentVersion: 2
  }, null, 2));
  let received = null;
  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      received = JSON.parse(body);
      response.end("ok");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const resultPromise = runCliAsync(["telemetry", "test", "--home-path", "/private/project"], configHome, {
    ORQUESTRADOR_MAESTRO_TELEMETRY_ENDPOINT: `http://127.0.0.1:${port}/capture`,
    ORQUESTRADOR_MAESTRO_TELEMETRY_API_KEY: "public-key"
  });
  const result = await resultPromise;
  await new Promise((resolve) => server.close(resolve));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(received.properties.command, "telemetry:test");
  assert.deepEqual(received.properties.flags, ["--home-path"]);
  assert.equal(received.properties.date.length, 10);
  assert.equal(received.properties.$process_person_profile, false);
  assert.doesNotMatch(JSON.stringify(received), /private|project|prompt|token|secret/u);
});

test("telemetry opt-out preserves the command exit code", () => {
  const configHome = makeTempDir("orquestrador-telemetry-");
  const result = runCli(["dry-run", "--core-only"], configHome, {
    ORQUESTRADOR_MAESTRO_TELEMETRY: "0",
    ORQUESTRADOR_MAESTRO_TELEMETRY_API_KEY: "public-key"
  });
  assert.equal(result.status, 0, result.stderr);
});
