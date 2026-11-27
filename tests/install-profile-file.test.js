"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runInstaller } = require("./test-helpers.js");

const ROOT = path.resolve(__dirname, "..");
const HELPER = path.join(ROOT, "scripts", "install-profile-file.js");

const TEMPLATE = {
  $schema: "https://opencode.ai/config.json",
  instructions: ["~/AGENTS.md", "~/.opencode/rules.md"]
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-profile-file-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "template.json");
  fs.writeFileSync(source, JSON.stringify(TEMPLATE, null, 2));
  return { root, source, backup: path.join(root, "backup") };
}

function run(args) {
  return spawnSync(process.execPath, [HELPER, ...args], { encoding: "utf8" });
}

test("install writes the template when the destination is missing", t => {
  const { root, source } = fixture(t);
  const destination = path.join(root, "config", "opencode.json");

  const result = run(["install", source, destination, path.join(root, "backup")]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, "utf8")), TEMPLATE);
});

test("install keeps user-owned root keys while the template still wins", t => {
  const { root, source } = fixture(t);
  const destination = path.join(root, "opencode.json");
  fs.writeFileSync(destination, JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    instructions: ["~/legacy.md"],
    provider: { flatt: { name: "Flatt", models: { automode: { name: "Auto" } } } },
    plugin: ["local-plugin"]
  }));

  const result = run(["install", source, destination, path.join(root, "backup")]);
  assert.equal(result.status, 0, result.stderr);

  const merged = JSON.parse(fs.readFileSync(destination, "utf8"));
  assert.deepEqual(merged.provider, { flatt: { name: "Flatt", models: { automode: { name: "Auto" } } } });
  assert.deepEqual(merged.plugin, ["local-plugin"]);
  assert.deepEqual(merged.instructions, TEMPLATE.instructions, "template arrays replace stale selections");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "backup", "opencode.json"), "utf8")).instructions,
    ["~/legacy.md"], "pre-merge content is backed up");
  assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
});

test("install never overwrites a destination that is not strict JSON", t => {
  const { root, source } = fixture(t);
  const destination = path.join(root, "opencode.json");
  const original = "// jsonc comment\n{ \"provider\": {} }\n";
  fs.writeFileSync(destination, original);

  const result = run(["install", source, destination, path.join(root, "backup")]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /left untouched/);
  assert.equal(fs.readFileSync(destination, "utf8"), original);
});

test("backup mode copies an existing settings file", t => {
  const { source, backup } = fixture(t);
  const destination = path.join(path.dirname(source), "live.json");
  fs.writeFileSync(destination, JSON.stringify({ provider: { flatt: {} } }));

  const result = run(["backup", source, destination, backup]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup, "live.json"), "utf8")), { provider: { flatt: {} } });
});

test("installer keeps the user provider block when a managed profile already exists", {
  skip: process.platform === "win32" ? "POSIX installer assertions" : false
}, t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-profile-merge-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const configDir = path.join(home, ".config", "opencode");

  // Detection reads PATH first, so a machine without the opencode binary would
  // never install the profile and the assertion would test nothing. Force
  // detection through the all-targets path instead of relying on the host.
  const install = () => runInstaller(home, {
    force: true,
    skipSkillSync: true,
    args: ["--install-tool-profiles", "--all-targets"],
    env: { XDG_CONFIG_HOME: path.join(home, ".config") }
  });

  const first = install();
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(configDir, "opencode.json")), "first install must create the managed profile");

  const userProvider = { flatt: { name: "Flatt", npm: "@ai-sdk/openai-compatible", models: { automode: { name: "Auto" } } } };
  const installed = JSON.parse(fs.readFileSync(path.join(configDir, "opencode.json"), "utf8"));
  fs.writeFileSync(path.join(configDir, "opencode.json"), JSON.stringify({
    ...installed,
    instructions: ["~/stale.md"],
    provider: userProvider
  }));

  const second = install();
  assert.equal(second.status, 0, second.stderr);

  const config = JSON.parse(fs.readFileSync(path.join(configDir, "opencode.json"), "utf8"));
  assert.deepEqual(config.provider, userProvider, "user provider block survives reinstall");
  assert.ok(config.instructions.includes("~/.orquestrador/rules.md"), "template instructions are applied");
  assert.ok(!config.instructions.includes("~/stale.md"), "template arrays replace stale selections");
});