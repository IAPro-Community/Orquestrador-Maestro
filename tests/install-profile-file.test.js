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
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
  }
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
    instructions: ["~/stale.md", "~/.orquestrador/SKILLS_ROUTER.json", "~/.orquestrador/rules.md"],
    provider: userProvider
  }));

  const second = install();
  assert.equal(second.status, 0, second.stderr);

  const config = JSON.parse(fs.readFileSync(path.join(configDir, "opencode.json"), "utf8"));
  assert.deepEqual(config.provider, userProvider, "user provider block survives reinstall");
  assert.ok(config.instructions.includes("~/AGENTS.md"), "compact contract is applied");
  assert.ok(config.instructions.includes("~/stale.md"), "user instructions survive");
  assert.ok(!config.instructions.includes("~/.orquestrador/SKILLS_ROUTER.json"), "eager catalog removed");
  assert.ok(!config.instructions.includes("~/.orquestrador/rules.md"), "duplicate policy removed");
  assert.equal(
    fs.readFileSync(path.join(configDir, ".maestro-managed"), "utf8"),
    "managed by orquestrador-maestro\ntool: opencode\n",
    "installer writes canonical tool marker"
  );
  assert.equal(fs.existsSync(path.join(home, ".orquestrador", "skill-library", "codex-skills", ".maestro-managed")), false,
    "non-profile targets must not receive .maestro-managed markers");
});

test("install-profile-file refuses symlink destinations", {
  skip: process.platform === "win32" ? "POSIX symlink assertion" : false
}, t => {
  const { root, source, backup } = fixture(t);
  const target = path.join(root, "real.json");
  fs.writeFileSync(target, JSON.stringify({ provider: { keep: true } }));
  const destination = path.join(root, "opencode.json");
  fs.symlinkSync(target, destination);

  const result = run(["install", source, destination, backup]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symbolic link/i);
});

test("non-interactive reinstall without --all-targets still merges previously installed profiles", {
  skip: process.platform === "win32" ? "POSIX installer assertions" : false
}, t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-profile-reinstall-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const configDir = path.join(home, ".config", "opencode");
  const { configurationState } = require("../orquestrador/lib/install-diagnostics.js");

  // Build a minimal PATH that contains node/bash/standard tools but NO opencode
  // binary, so the second install proves it relies on INSTALL_PROFILES.json
  // instead of skipping the profile when .maestro-managed is present.
  const minimalBin = path.join(home, "bin");
  fs.mkdirSync(minimalBin, { recursive: true });
  for (const dir of ["/bin", "/usr/bin", path.dirname(process.execPath)]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of ["node", "bash", "sh", "mkdir", "rm", "cp", "mv", "cat", "sed", "grep", "find", "chmod", "date", "basename", "dirname", "head", "tr", "printf", "mktemp", "uname"]) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate) && !fs.existsSync(path.join(minimalBin, name))) {
        fs.symlinkSync(candidate, path.join(minimalBin, name));
      }
    }
  }

  const first = runInstaller(home, {
    force: true,
    skipSkillSync: true,
    args: ["--install-tool-profiles", "--all-targets"],
    env: { PATH: minimalBin, XDG_CONFIG_HOME: path.join(home, ".config") }
  });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(configurationState("opencode", home), "maestro-managed");

  const userProvider = { flatt: { name: "Flatt", models: { automode: { name: "Auto" } } } };
  const installed = JSON.parse(fs.readFileSync(path.join(configDir, "opencode.json"), "utf8"));
  fs.writeFileSync(path.join(configDir, "opencode.json"), JSON.stringify({
    ...installed,
    instructions: ["~/stale.md", "~/.orquestrador/SKILLS_ROUTER.json", "~/.orquestrador/rules.md"],
    provider: userProvider
  }));

  const second = runInstaller(home, {
    force: true,
    skipSkillSync: true,
    args: ["--install-tool-profiles"],
    env: { PATH: minimalBin, XDG_CONFIG_HOME: path.join(home, ".config") }
  });
  assert.equal(second.status, 0, second.stderr);

  const config = JSON.parse(fs.readFileSync(path.join(configDir, "opencode.json"), "utf8"));
  assert.deepEqual(config.provider, userProvider, "user provider block survives non-interactive reinstall without --all-targets");
  assert.ok(config.instructions.includes("~/AGENTS.md"), "compact contract is applied");
  assert.ok(config.instructions.includes("~/stale.md"), "user instructions survive");
  assert.ok(!config.instructions.includes("~/.orquestrador/SKILLS_ROUTER.json"), "eager catalog removed");
  assert.ok(!config.instructions.includes("~/.orquestrador/rules.md"), "duplicate policy removed");
});

test("compact OpenCode migration preserves custom instructions and provider settings", t => {
  const { root, backup } = fixture(t);
  const source = path.join(ROOT, "tool-profiles", "opencode-global", "opencode.json");
  const destination = path.join(root, "opencode.json");
  const before = { instructions: ["~/.orquestrador/SKILLS_ROUTER.json", "~/.orquestrador-maestro/SKILLS_INDEX.md", "~/custom/SKILLS_INDEX.md", "~/my-rules.md", "~/AGENTS.md", "~/.opencode/hooks.md"], provider: { custom: {} }, plugins: ["user"] };
  fs.writeFileSync(destination, JSON.stringify(before));
  const first = run(["install", source, destination, backup]);
  assert.equal(first.status, 0, first.stderr);
  const after = JSON.parse(fs.readFileSync(destination, "utf8"));
  assert.deepEqual(after.instructions, ["~/AGENTS.md", "~/custom/SKILLS_INDEX.md", "~/my-rules.md"]);
  assert.deepEqual(after.provider, before.provider);
  assert.deepEqual(after.plugins, before.plugins);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup, "opencode.json"), "utf8")), before);
  const second = run(["install", source, destination, backup]);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(destination, "utf8")), after);
});


test("first managed OpenCode install preserves an existing unmarked JSON config", { skip: process.platform === "win32" }, t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-first-opencode-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const configDir = path.join(home, ".config", "opencode");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "opencode.json"), JSON.stringify({ provider: { custom: {} }, instructions: ["~/custom.md"] }));
  const result = runInstaller(home, { force: true, skipSkillSync: true, args: ["--install-tool-profiles", "--all-targets"], env: { XDG_CONFIG_HOME: path.join(home, ".config") } });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(configDir, "opencode.json"), "utf8"));
  assert.deepEqual(config.provider, { custom: {} });
  assert.deepEqual(config.instructions, ["~/AGENTS.md", "~/custom.md"]);
  assert.ok(fs.existsSync(path.join(configDir, ".maestro-managed")));
});
