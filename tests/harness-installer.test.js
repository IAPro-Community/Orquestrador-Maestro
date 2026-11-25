"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "bin", "orquestrador-maestro.js");
const {
  installHarnessAdapter,
  updateHarnessAdapter,
  removeHarnessAdapter,
  rollbackHarnessAdapter,
  listHarnessBackups,
  installDetectedHarnesses,
  harnessDoctor
} = require("../runtime/integrations/harness/installer");

function makeHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-harness-inst-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test("install/update/remove/rollback preserve user config and handle absent target safely", (t) => {
  const home = makeHome(t);
  const claudeSettings = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
  const initialUser = {
    model: "claude-sonnet-user",
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo user-hook" }] }]
    }
  };
  fs.writeFileSync(claudeSettings, JSON.stringify(initialUser, null, 2) + "\n", "utf8");

  // Dry-run does not modify file or write backup
  const dry = installHarnessAdapter("claude", { home, packageRoot: repoRoot, dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.changed, true);
  assert.equal(listHarnessBackups("claude", home).length, 0);

  // Real install preserves user setting + existing hook
  const installed = installHarnessAdapter("claude", { home, packageRoot: repoRoot });
  assert.equal(installed.action, "updated");
  assert.equal(installed.changed, true);
  const afterInstall = JSON.parse(fs.readFileSync(claudeSettings, "utf8"));
  assert.equal(afterInstall.model, "claude-sonnet-user");
  assert.equal(afterInstall.hooks.UserPromptSubmit.length, 2);
  assert.equal(afterInstall.hooks.Stop.length, 1);

  // Idempotent update creates no spurious change
  const second = updateHarnessAdapter("claude", { home, packageRoot: repoRoot });
  assert.equal(second.changed, false);
  assert.equal(second.action, "unchanged");

  // Remove strips only Maestro hooks, preserving user hook
  const removed = removeHarnessAdapter("claude", { home, packageRoot: repoRoot });
  assert.equal(removed.action, "removed");
  const afterRemove = JSON.parse(fs.readFileSync(claudeSettings, "utf8"));
  assert.deepEqual(afterRemove, initialUser);

  // Gemini initially absent -> install creates config & rollback deletes created file
  const geminiSettings = path.join(home, ".gemini", "settings.json");
  const gemInstall = installHarnessAdapter("gemini", { home, packageRoot: repoRoot });
  assert.equal(gemInstall.action, "installed");
  assert.equal(fs.existsSync(geminiSettings), true);
  const gemRollback = rollbackHarnessAdapter("gemini", { home });
  assert.equal(gemRollback.restored, true);
  assert.equal(gemRollback.existedBefore, false);
  assert.equal(fs.existsSync(geminiSettings), false);
});

test("OpenCode V2 installer preserves existing plugins, detects JSONC and rejects symlinks/malformed JSON", (t) => {
  const home = makeHome(t);
  const ocFile = path.join(home, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(ocFile), { recursive: true });
  fs.writeFileSync(ocFile, JSON.stringify({ theme: "dark", plugins: ["/custom/user-plugin"] }), "utf8");

  const ocRes = installHarnessAdapter("opencode", { home, packageRoot: repoRoot });
  assert.equal(ocRes.action, "updated");
  const ocParsed = JSON.parse(fs.readFileSync(ocFile, "utf8"));
  assert.equal(ocParsed.theme, "dark");
  assert.equal(ocParsed.plugins.length, 2);
  assert.equal(ocParsed.plugins[0], "/custom/user-plugin");

  const ocRemoved = removeHarnessAdapter("opencode", { home, packageRoot: repoRoot });
  assert.equal(ocRemoved.action, "removed");
  assert.deepEqual(JSON.parse(fs.readFileSync(ocFile, "utf8")).plugins, ["/custom/user-plugin"]);

  // Malformed JSON fails closed
  const claudeSettings = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
  fs.writeFileSync(claudeSettings, "{ broken json", "utf8");
  assert.throws(() => installHarnessAdapter("claude", { home, packageRoot: repoRoot }), { code: "INVALID_HOST_SETTINGS" });

  // OpenCode JSONC requires explicit manual edit (never corrupts comments)
  const jsoncHome = makeHome(t);
  fs.mkdirSync(path.join(jsoncHome, ".config", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(jsoncHome, ".config", "opencode", "opencode.jsonc"), "{ /* comment */ }\n", "utf8");
  assert.throws(() => installHarnessAdapter("opencode", { home: jsoncHome, packageRoot: repoRoot }), { code: "JSONC_MANUAL_EDIT_REQUIRED" });

  // Symlinked settings target fails closed
  const symTarget = path.join(home, "outside.json");
  fs.writeFileSync(symTarget, "{}", "utf8");
  const gemDir = path.join(home, ".gemini");
  fs.mkdirSync(gemDir, { recursive: true });
  fs.symlinkSync(symTarget, path.join(gemDir, "settings.json"));
  assert.throws(() => installHarnessAdapter("gemini", { home, packageRoot: repoRoot }), { code: "UNSAFE_SYMLINK_PATH" });
});

test("selective detection install, harnessDoctor, and CLI subcommands work end-to-end", (t) => {
  const home = makeHome(t);
  // Simulate only Gemini configured directory present (not detected via binary)
  fs.mkdirSync(path.join(home, ".gemini"), { recursive: true });

  const selective = installDetectedHarnesses({
    home, packageRoot: repoRoot, dryRun: false, probeCommand: () => ({ installed: false, version: null })
  });
  const gemEntry = selective.results.find((r) => r.host === "gemini");
  const claudeEntry = selective.results.find((r) => r.host === "claude");
  assert.equal(gemEntry.skipped, false);
  assert.equal(gemEntry.action, "installed");
  assert.equal(claudeEntry.skipped, true);

  const doc = harnessDoctor({ home, packageRoot: repoRoot, probeCommand: () => ({ installed: false, version: null }) });
  assert.equal(doc.healthy, true);
  assert.equal(doc.hookTrust, "host-managed");
  assert.equal(doc.hosts.gemini.configured, true);
  assert.equal(doc.hosts.gemini.syntheticHook, "synthetic-hook-ok");

  // Real CLI `harness status --json` & `harness doctor --json`
  const statusCli = spawnSync(process.execPath, [cliPath, "harness", "status", "--home-path", home, "--json"], {
    cwd: repoRoot, encoding: "utf8"
  });
  assert.equal(statusCli.status, 0, statusCli.stderr);
  const parsedStatus = JSON.parse(statusCli.stdout);
  assert.equal(parsedStatus.harnesses.gemini.compatibilityLevel, "governed");
  assert.equal(parsedStatus.summary.goalIntegrated, 0);

  const doctorCli = spawnSync(process.execPath, [cliPath, "harness", "doctor", "--home-path", home, "--json"], {
    cwd: repoRoot, encoding: "utf8"
  });
  assert.equal(doctorCli.status, 0, doctorCli.stderr);
  assert.equal(JSON.parse(doctorCli.stdout).hosts.gemini.syntheticHook, "synthetic-hook-ok");
});
