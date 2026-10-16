"use strict";

// 1.1.0: `install` auto-installs the ChatGPT/Codex desktop plugin when the
// platform supports the desktop app (or the app is present on Linux preview
// distros), unless --skip-desktop-plugin / --only without codex is passed.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const { desktopAppSupport } = require(path.join(ROOT, "orquestrador", "lib", "codex-home.js"));
const CLI = path.join(ROOT, "bin", "orquestrador-maestro.js");

function desktopAppPresent() {
  if (process.platform === "darwin") return fs.existsSync("/Applications/ChatGPT.app");
  if (process.platform !== "linux") return false;
  return (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, "chatgpt"))
    .some((candidate) => fs.existsSync(candidate));
}

function runCliInstall(home, extra = []) {
  return spawnSync(process.execPath, [
    CLI,
    "install",
    "--home-path", home,
    "--non-interactive",
    "--skip-skill-sync",
    ...extra
  ], { encoding: "utf8", cwd: ROOT });
}

function pluginManifest(home) {
  return path.join(home, ".codex", "plugins", "orquestrador-maestro", "plugin.json");
}

test("install auto-installs the desktop plugin when the desktop app is supported or present", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-desktop-auto-"));
  const res = runCliInstall(home, ["--only", "codex"]);
  assert.equal(res.status, 0, `install failed: ${(res.stderr || "").slice(0, 2000)}`);
  const expected = desktopAppSupport().supported || desktopAppPresent();
  assert.equal(fs.existsSync(pluginManifest(home)), expected);
  if (expected) {
    const marketplace = JSON.parse(fs.readFileSync(path.join(home, ".agents", "plugins", "marketplace.json"), "utf8"));
    assert.ok(marketplace.plugins.some((plugin) => plugin.name === "orquestrador-maestro"), "marketplace entry required");
  }
});

test("--skip-desktop-plugin suppresses the desktop plugin step", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-desktop-skip-"));
  const res = runCliInstall(home, ["--only", "codex", "--skip-desktop-plugin"]);
  assert.equal(res.status, 0, `install failed: ${(res.stderr || "").slice(0, 2000)}`);
  assert.equal(fs.existsSync(pluginManifest(home)), false);
});

test("--only without codex skips the desktop plugin step", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-desktop-only-"));
  const res = runCliInstall(home, ["--only", "claude"]);
  assert.equal(res.status, 0, `install failed: ${(res.stderr || "").slice(0, 2000)}`);
  assert.equal(fs.existsSync(pluginManifest(home)), false);
});
