"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const bashFlavor = spawnSync("bash", ["-lc", "uname -s"], { encoding: "utf8" }).stdout?.trim() || "";
const bashPath = (value) => {
  const absolute = path.resolve(value).replace(/\\/g, "/");
  return absolute.replace(/^([A-Za-z]):\/(.*)$/u, (_match, drive, rest) =>
    bashFlavor.startsWith("MINGW") || bashFlavor.startsWith("MSYS")
      ? `/${drive.toLowerCase()}/${rest}`
      : `/mnt/${drive.toLowerCase()}/${rest}`);
};
const powershell = ["pwsh", "powershell"].find((command) => {
  const probe = spawnSync(command, ["-NoProfile", "-Command", "$true"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
});

test("targets sync uses the bundled core when .orquestrador only contains target state", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-target-sync-fallback-"));
  try {
    const partialCore = path.join(home, ".orquestrador");
    fs.mkdirSync(partialCore, { recursive: true });
    fs.writeFileSync(path.join(partialCore, "INSTALL_STATE.json"), "{}\n", "utf8");

    const shellSync = path.join(ROOT, "orquestrador", "sync-skills.sh");
    const shellResult = spawnSync("bash", [
      bashPath(shellSync), "--apply", "--home-path", bashPath(home), "--only", "codex",
    ], {
      encoding: "utf8",
      env: { ...process.env, HOME: bashPath(home) },
    });
    assert.equal(shellResult.status, 0, `Bash sync failed:\n${shellResult.stderr}\n${shellResult.stdout}`);
    assert.ok(fs.existsSync(path.join(home, ".codex", "skills", "orquestrador-maestro", "SKILL.md")));

    if (powershell) {
      fs.rmSync(path.join(home, ".codex", "skills", "orquestrador-maestro"), { recursive: true, force: true });
      const psSync = path.join(ROOT, "orquestrador", "sync-skills.ps1");
      const psResult = spawnSync(powershell, [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psSync,
        "-Apply", "-HomePath", home, "-Only", "codex",
      ], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
      assert.equal(psResult.status, 0, `PowerShell sync failed:\n${psResult.stderr}\n${psResult.stdout}`);
      assert.ok(fs.existsSync(path.join(home, ".codex", "skills", "orquestrador-maestro", "SKILL.md")));
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
