"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");

function runHelp() {
  return spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("P3 --help lista o comando go com a sintaxe do dispatcher", () => {
  const result = runHelp();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /orquestrador-maestro go /u);
});

test("P3 --help lista o comando plan com a sintaxe do dispatcher", () => {
  const result = runHelp();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /orquestrador-maestro plan /u);
});