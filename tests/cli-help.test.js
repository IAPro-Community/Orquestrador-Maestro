"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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

test("--help não repete nenhuma linha de comando", () => {
  const result = runHelp();
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.split("\n").map(l => l.trim()).filter(l => l.startsWith("orquestrador-maestro "));
  const seen = new Set();
  const dupes = [];
  for (const line of lines) {
    if (seen.has(line)) dupes.push(line);
    seen.add(line);
  }
  assert.deepEqual(dupes, []);
});

test("memory --help routes to subcommand help instead of global help", () => {
  const result = spawnSync(process.execPath, [cliPath, "memory", "--help"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /^Orquestrador Maestro CLI /u);
  assert.match(result.stdout, /memory|record|search|forget|export|import/i);
});

test("check-recurrence dispatches cleanly from main CLI", () => {
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-recurrence-cli-"));
  try {
    fs.mkdirSync(path.join(tmpProject, "DEV"), { recursive: true });
    fs.writeFileSync(path.join(tmpProject, "DEV", "WORKLOG.md"), "# Worklog\n\n## 2026-11-25 — Probe\n- Initialized test entry.\n", "utf8");
    const result = spawnSync(process.execPath, [cliPath, "check-recurrence", "--project-path", tmpProject, "--threshold", "99"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DEV|worklog|recurrence|hotspots/i);
  } finally {
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
});