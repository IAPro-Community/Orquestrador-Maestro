"use strict";

// Regression guard for the cli/ module split: a handler moved to
// cli/commands/ that forgets an import only fails when that exact command
// runs. The suite covered the runtime but not every CLI entrypoint, so a
// missing helper reached CI unnoticed. This test drives the commands that
// need no credentials and fails on unresolved references.

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { makeTempDir } = require("./test-helpers.js");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

// Match the shapes Node prints for a broken module, not any prose that
// happens to mention them: the changelog quotes a "Cannot find module"
// error on purpose.
const UNRESOLVED = /^(?:ReferenceError|TypeError|SyntaxError): |^Error: Cannot find module/mu;

const COMMANDS = [
  ["--help"],
  ["--version"],
  ["changelog"],
  ["version"],
  ["adapters"],
  ["benchmark", "list"],
  ["governance", "status"],
  ["interaction", "list"],
  ["memory", "stats"],
  ["projects"],
  ["providers", "list"],
  ["route", "explain", "teste"],
  ["skill-catalog", "validate"],
  ["skills", "list"],
  ["status"],
  ["telemetry", "status"],
  ["targets", "list", "--json"],
  ["usage", "--limit", "1"]
];

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, ...env }
  });
}

test("every credential-free CLI command resolves its references", () => {
  const failures = [];
  for (const args of COMMANDS) {
    const result = runCli(args);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (UNRESOLVED.test(output)) {
      failures.push(`${args.join(" ")} => ${output.split("\n").find((line) => UNRESOLVED.test(line))}`);
    }
  }
  assert.deepEqual(failures, [], `Unresolved references in CLI commands:\n${failures.join("\n")}`);
});

test("targets sync resolves the shared run helper", () => {
  const homePath = makeTempDir("maestro-targets-sync-");
  const add = runCli(["targets", "add", "codex", "--home-path", homePath]);
  assert.doesNotMatch(`${add.stdout || ""}\n${add.stderr || ""}`, UNRESOLVED, add.stderr);

  // sync only reaches the shared run() helper when a target is enabled, and
  // it catches helper failures into a "failed" array instead of throwing.
  const result = runCli(["targets", "sync", "--home-path", homePath, "--json"]);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.doesNotMatch(output, UNRESOLVED, output);
  assert.doesNotMatch(output, /is not defined/u, output);
});

test("changelog resolves the shared commandExists helper", () => {
  const result = runCli(["changelog"]);
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.doesNotMatch(output, UNRESOLVED, output);
  assert.match(result.stdout, /^# Changelog/mu);
});
