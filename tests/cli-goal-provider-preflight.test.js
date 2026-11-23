"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");
const test = require("node:test");

const CLI = path.resolve(__dirname, "../bin/orquestrador-maestro.js");

test("providers goals is a read-only versioned diagnostic, not an overnight dispatch", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-goal-preflight-"));
  t.after(() => fs.rmSync(tmp, { force: true, recursive: true }));
  execFileSync("git", ["init", "-q", tmp], { stdio: "pipe" });
  const result = spawnSync(process.execPath,
    [CLI, "providers", "goals", "--project-path", tmp],
    { encoding: "utf8", timeout: 20000, env: { ...process.env, MAESTRO_TELEMETRY_DISABLED: "1" } });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.mode, "read-only");
  assert.equal(output.autonomyEnabled, false);
  assert.deepEqual(output.providers.map((item) => item.providerId),
    ["codex", "claude", "opencode"]);
  for (const item of output.providers) {
    assert.equal(item.nativeOvernightReady, false);
    assert.equal(item.managedOvernightReady, false);
  }
});
