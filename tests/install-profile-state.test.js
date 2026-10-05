"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PROFILE_ROOTS, STATE_FILE, writeState, readRoots, validateState } = require("../scripts/install-profile-state.js");

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "bin/orquestrador-maestro.js");

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-profiles-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function cli(home, command, args = []) {
  return spawnSync(process.execPath, [CLI, command, "--home-path", home, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180000,
    env: { ...process.env, ORQUESTRADOR_ALLOW_ROOT_INSTALL: "1" }
  });
}

function passed(result) {
  assert.equal(result.status, 0, `${result.error || ""}\n${result.stdout}\n${result.stderr}`);
}

test("profile metadata records symbolic IDs and rejects malformed or unknown scopes", t => {
  const home = fixture(t);
  writeState(home, []);
  assert.deepEqual(readRoots(home), []);
  writeState(home, ["codex", "opencode-global", "antigravity-home"]);
  assert.deepEqual(readRoots(home), [".codex", ".config/opencode", "antigravity-rules.json"]);
  assert.ok(!fs.readFileSync(path.join(home, STATE_FILE), "utf8").includes(home));
  for (const state of [null, {}, { version: 2, profiles: [] },
    { version: 1, profiles: ["../escape"] }, { version: 1, profiles: ["codex", "codex"] },
    { version: 1, profiles: ["toString"] }, { version: 1, profiles: [null] }]) {
    assert.throws(() => validateState(state), /Invalid install profile metadata/u);
  }
});

test("non-interactive install verifies only recorded profiles and still detects damage", t => {
  const home = fixture(t);
  fs.mkdirSync(path.join(home, ".codex"));
  const install = cli(home, "install", ["--non-interactive"]);
  passed(install);
  const core = path.join(home, ".orquestrador-maestro");
  const state = JSON.parse(fs.readFileSync(path.join(core, STATE_FILE), "utf8"));
  assert.ok(state.profiles.includes("codex"));
  assert.match(install.stdout, /ToolProfilesInstalled\s*:/u);
  passed(cli(home, "verify"));

  fs.writeFileSync(path.join(home, ".codex", "AGENTS.md"), "Incomplete profile\n", "utf8");
  const corrupted = cli(home, "verify");
  assert.equal(corrupted.status, 1, corrupted.stdout + corrupted.stderr);
  assert.match(corrupted.stdout + corrupted.stderr, /Codex AGENTS profile does not include expected content/u);

  // Skills create other tool directories after detection. They must not
  // retroactively expand the verification scope.
  fs.rmSync(path.join(home, ".codex", "AGENTS.md"));
  const damaged = cli(home, "verify");
  assert.equal(damaged.status, 1, damaged.stdout + damaged.stderr);
  assert.match(damaged.stdout + damaged.stderr, /Codex AGENTS profile missing/u);

  fs.writeFileSync(path.join(core, STATE_FILE), '{"version":1,"profiles":["unknown"]}', "utf8");
  const malformed = cli(home, "verify");
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stdout + malformed.stderr, /invalid install profile metadata/iu);
});

test("disabled profiles verify with an empty scope; legacy installs remain strict", t => {
  const home = fixture(t);
  const install = cli(home, "install", ["--non-interactive", "--no-tool-profiles"]);
  passed(install);
  const core = path.join(home, ".orquestrador-maestro");
  assert.deepEqual(readRoots(core), []);
  assert.match(install.stdout, /ToolProfiles\s*:\s*false/iu);
  passed(cli(home, "verify"));
  fs.rmSync(path.join(core, STATE_FILE));
  const legacy = cli(home, "verify");
  assert.equal(legacy.status, 1, legacy.stdout + legacy.stderr);
  assert.match(legacy.stdout + legacy.stderr, /Codex AGENTS profile missing/u);
});

test("all-targets installs every profile and verification rejects missing files", t => {
  const home = fixture(t);
  passed(cli(home, "install", ["--non-interactive", "--all-targets"]));
  const core = path.join(home, ".orquestrador-maestro");
  const roots = readRoots(core);
  assert.deepEqual(new Set(roots), new Set(Object.values(PROFILE_ROOTS)));
  passed(cli(home, "verify"));
  fs.rmSync(path.join(home, ".config", "opencode", "opencode.json"));
  const damaged = cli(home, "verify");
  assert.equal(damaged.status, 1, damaged.stdout + damaged.stderr);
  assert.match(damaged.stdout + damaged.stderr, /OpenCode global config missing/u);
});

test("Unix installers block root with and without sudo before creating a home", { skip: process.platform === "win32" }, t => {
  const scratch = fixture(t);
  const fakeBin = path.join(scratch, "bin");
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, "id"), "#!/bin/sh\nprintf '0\\n'\n", { mode: 0o755 });
  for (const script of ["install.sh", "scripts/install.sh"]) {
    for (const sudoUser of ["", "normal-user"]) {
      const home = path.join(scratch, "uncreated-home");
      const result = spawnSync("bash", [path.join(ROOT, script), "--home-path", home], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, SUDO_USER: sudoUser, ORQUESTRADOR_ALLOW_ROOT_INSTALL: "" }
      });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /without sudo\/root/u);
      assert.equal(fs.existsSync(home), false);
    }
    const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, ORQUESTRADOR_ALLOW_ROOT_INSTALL: "" };
    const dryRun = spawnSync("bash", [path.join(ROOT, script), "--home-path", scratch, "--dry-run"], { encoding: "utf8", env });
    passed(dryRun);
    const list = spawnSync("bash", [path.join(ROOT, script), "--home-path", scratch, "--list-targets"], { encoding: "utf8", env });
    passed(list);
    const override = spawnSync("bash", [path.join(ROOT, script), "--home-path", scratch, "--only", "invalid-component"], {
      encoding: "utf8", env: { ...env, ORQUESTRADOR_ALLOW_ROOT_INSTALL: "1" }
    });
    assert.equal(override.status, 1);
    assert.match(override.stderr, /unknown component/u);
    assert.doesNotMatch(override.stderr, /without sudo\/root/u);
  }
});
