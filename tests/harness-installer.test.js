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
const { sanitizeCliError } = require("../scripts/harness-hook");
const { inspectHarness, inspectAllHarnesses } = require("../runtime/integrations/harness/registry");

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

  // Backups hold the previous host settings content, so they must not live in
  // the Maestro core root: the installer copies that root into the public
  // backup tree on every install and update.
  const backupFiles = listHarnessBackups("claude", home);
  assert.equal(backupFiles.length > 0, true);
  for (const backup of backupFiles) {
    assert.equal(backup.file.includes(`${path.sep}.orquestrador${path.sep}`), false,
      `harness backup must stay out of the Maestro core root: ${backup.file}`);
  }
  assert.equal(fs.existsSync(path.join(home, ".maestro-harness-backups")), true);

  // A symlinked backup directory would redirect the rollback read outside the
  // home; it must fail closed instead of listing foreign files.
  const symlinkHome = makeHome(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-harness-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "claude-fake.json"), "{}", "utf8");
  fs.symlinkSync(outside, path.join(symlinkHome, ".maestro-harness-backups"));
  assert.throws(() => listHarnessBackups("claude", symlinkHome), { code: "UNSAFE_SYMLINK_PATH" });
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

test("direct harness CLI works without a circular dependency and reports sanitized errors", (t) => {
  const home = makeHome(t);

  // scripts/harness-hook.js is loaded by runtime/integrations/harness/installer.js.
  // A static cycle exposed a partially initialized export and broke the direct CLI.
  const direct = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "harness-hook.js"), "install", "claude", "--home-path", home], {
    cwd: repoRoot, encoding: "utf8"
  });
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(direct.stderr.includes("circular dependency"), false, `circular dependency warning:\n${direct.stderr}`);
  const parsed = JSON.parse(direct.stdout);
  assert.equal(parsed.action, "installed");
  assert.equal(parsed.changed, true);

  // A host error must stay diagnosable without leaking the absolute settings path.
  const brokenHome = makeHome(t);
  fs.mkdirSync(path.join(brokenHome, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(brokenHome, ".claude", "settings.json"), "{ broken json", "utf8");
  const failed = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "harness-hook.js"), "install", "claude", "--home-path", brokenHome], {
    cwd: repoRoot, encoding: "utf8"
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Maestro harness hook: INVALID_HOST_SETTINGS/);
  assert.equal(failed.stderr.includes(brokenHome), false, `absolute home path leaked:\n${failed.stderr}`);
  assert.equal(failed.stderr.includes("<path>"), true, `expected a redacted path:\n${failed.stderr}`);
});

test("doctor prints the harness summary on every platform path", (t) => {
  const home = makeHome(t);
  const res = spawnSync(process.execPath, [cliPath, "doctor", "--home-path", home], {
    cwd: repoRoot, encoding: "utf8"
  });
  assert.match(res.stdout + res.stderr, /Harness adapters: healthy=(true|false) configured=/,
    `doctor must report the harness summary:\n${res.stdout?.slice(-800)}\n${res.stderr?.slice(-800)}`);
});

test("the shell installer tolerates symlinks inside the target tree and records the manifest", {
  skip: process.platform === "win32" ? "symlink-based scenario is POSIX-only" : false
}, (t) => {
  const { runInstaller: runNativeInstaller } = require("./test-helpers.js");
  const home = makeHome(t);
  // Simulate the real-world host state: a previous skill sync left a symlink
  // pointing at a repository checkout inside ~/.orquestrador. The installer
  // must still back up, swap and record MANAGED_FILES.json.
  const maestroRoot = path.join(home, ".orquestrador");
  fs.mkdirSync(maestroRoot, { recursive: true });
  fs.writeFileSync(path.join(maestroRoot, "keepme.txt"), "user file", "utf8");
  const outsideDir = path.join(home, "outside-src");
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(outsideDir, "SKILL.md"), "---\nname: linked\n---\n", "utf8");
  fs.symlinkSync(path.join(outsideDir, "SKILL.md"), path.join(maestroRoot, "linked-skill.md"));

  const res = runNativeInstaller(home, { force: true, skipSkillSync: true });
  assert.equal(res.status, 0, `installer failed: ${res.stderr?.slice(0, 2000)}`);
  assert.equal(fs.existsSync(path.join(maestroRoot, "MANAGED_FILES.json")), true, "manifest must be recorded despite inner symlinks");
  // The user file that only existed in the old tree survives the swap.
  assert.equal(fs.readFileSync(path.join(maestroRoot, "keepme.txt"), "utf8"), "user file", "untracked user file must survive");
});

test("the shell installer still refuses a symlinked top-level target", {
  skip: process.platform === "win32" ? "symlink-based scenario is POSIX-only" : false
}, (t) => {
  const { runInstaller: runNativeInstaller } = require("./test-helpers.js");
  const home = makeHome(t);
  const elsewhere = path.join(home, "elsewhere");
  fs.mkdirSync(elsewhere, { recursive: true });
  fs.symlinkSync(elsewhere, path.join(home, ".orquestrador"));
  const res = runNativeInstaller(home, { force: true, skipSkillSync: true });
  assert.equal(res.status, 1, "a symlinked root must keep being refused");
  assert.match(res.stderr + res.stdout, /refusing to replace a symbolic link/i);
});

test("sanitizeCliError redacts Windows, UNC and POSIX paths without fragmenting them", () => {
  const cases = [
    ["cannot read C:\\data\\profiles\\user1\\.orquestrador\\settings.json now", ["data", "profiles", "user1", "settings.json"]],
    ["failed at C:/data/profiles/user1/settings.json", ["data", "profiles", "user1"]],
    ["C:\\data\\user2\\file.json", ["data", "user2", "file.json"]],
    ["network \\\\srv\\share\\file.json", ["srv", "share", "file.json"]],
    ["UNC \\\\srv\\my share\\user1\\file.json failed", ["srv", "my share", "user1", "file.json"]],
    ["open file:///C:/data/user1/x.json", ["data", "user1"]],
    ["open /home/user1/.orquestrador/rules.md please", ["home", "user1", "rules.md"]],
    ["POSIX /Users/John Doe/Library/settings.json failed", ["Users", "John Doe", "Library", "settings.json"]],
    ["Quoted \"C:\\Program Files\\App\\settings.json\" failed", ["Program Files", "App", "settings.json"]],
    ["Double space C:\\Users\\John  Doe\\settings.json", ["Users", "John  Doe", "settings.json"]],
    ["plain message without path", []]
  ];
  for (const [message, secrets] of cases) {
    const output = sanitizeCliError(new Error(message));
    assert.match(output, /^INVALID_INVOCATION: /);
    for (const secret of secrets) {
      assert.equal(output.includes(secret), false, `leaked "${secret}" in: ${output}`);
    }
    assert.equal(output.includes("\n"), false);
  }
  assert.equal(sanitizeCliError(new TypeError("bad arg")), "INVALID_ARGUMENT: bad arg");
  const coded = new Error("boom");
  coded.code = "HARNESS_PATH_NOT_SHELL_SAFE";
  assert.match(sanitizeCliError(coded), /^HARNESS_PATH_NOT_SHELL_SAFE: boom$/);
  // Truncation happens before rewriting, so a long message cannot keep half a path.
  assert.equal(sanitizeCliError(new Error(`${"x".repeat(600)} /home/user1/secret`)).length <= 200 + "INVALID_INVOCATION: ".length, true);
});

test("registry reports an unusable package path instead of crashing", (t) => {
  const home = makeHome(t);
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ hooks: {} }), "utf8");

  // A package root with characters that cannot be rendered as a shell-safe
  // hook command must degrade to "not configured", never throw.
  const unsafeRoot = path.join(home, "pkg#hash");
  fs.mkdirSync(unsafeRoot, { recursive: true });
  const inspected = inspectHarness("claude", {
    home, packageRoot: unsafeRoot, probeCommand: () => ({ installed: false, version: null })
  });
  assert.equal(inspected.adapterState.detail, "hook-path-not-shell-safe");
  assert.equal(inspected.adapterState.installed, false);
  assert.equal(inspected.unavailabilityReasons.includes("EXECUTABLE_ADAPTER_NOT_CONFIGURED"), true);

  // Every harness must still be inspectable in one pass.
  const all = inspectAllHarnesses({ home, packageRoot: unsafeRoot, probeCommand: () => ({ installed: false, version: null }) });
  assert.equal(Object.keys(all.harnesses).length > 0, true);
});

test("a non-path render failure is never relabelled as hook-path-not-shell-safe", (t) => {
  const home = makeHome(t);
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ hooks: {} }), "utf8");
  const packageRoot = path.join(home, "pkg-safe");
  fs.mkdirSync(packageRoot, { recursive: true });
  const hookPath = require.resolve("../scripts/harness-hook");
  const previous = require.cache[hookPath];
  require.cache[hookPath] = {
    ...previous,
    exports: {
      ...previous.exports,
      renderHookConfig: () => { throw new Error("renderHookConfig exploded"); }
    }
  };
  try {
    assert.throws(
      () => inspectHarness("claude", { home, packageRoot, probeCommand: () => ({ installed: false, version: null }) }),
      /renderHookConfig exploded/
    );
  } finally {
    require.cache[hookPath] = previous;
  }
});

test("probe results are memoized per command within one process", (t) => {
  // The doctor inspects every harness; without memoization a dozen installed
  // CLIs pay the spawn timeout once per command per pass.
  const { probeExecutable } = require("../runtime/integrations/harness/registry");
  let calls = 0;
  const spy = () => { calls += 1; return { installed: false, version: null }; };
  probeExecutable("cmd-a", spy, "test:cmd-a");
  probeExecutable("cmd-a", spy, "test:cmd-a");
  probeExecutable("cmd-a", spy, "test:cmd-a");
  assert.equal(calls, 1, "same command must hit the cache");
  probeExecutable("cmd-b", spy, "test:cmd-b");
  assert.equal(calls, 2, "a different command must miss the cache");
  probeExecutable("cmd-c", spy, null);
  probeExecutable("cmd-c", spy, null);
  assert.equal(calls, 4, "calls without a cache key stay uncached");
});

test("an explicit host list narrows the detected install scope", (t) => {
  const home = makeHome(t);
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".gemini"), { recursive: true });

  // `--only claude` must not configure an adapter for another detected tool.
  const scoped = installDetectedHarnesses({
    home, packageRoot: repoRoot, hosts: ["claude"], probeCommand: () => ({ installed: false, version: null })
  });
  assert.deepEqual(scoped.results.map((r) => r.host), ["claude"]);
  assert.equal(fs.existsSync(path.join(home, ".gemini", "settings.json")), false);
  assert.equal(fs.existsSync(path.join(home, ".claude", "settings.json")), true);

  // An unknown or empty selection configures nothing.
  const none = installDetectedHarnesses({
    home, packageRoot: repoRoot, hosts: ["codex"], probeCommand: () => ({ installed: false, version: null })
  });
  assert.deepEqual(none.results, []);
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
