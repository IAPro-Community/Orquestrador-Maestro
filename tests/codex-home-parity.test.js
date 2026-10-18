"use strict";

// 1.1.0: Codex home parity with the ChatGPT desktop app.
//
// The Codex CLI, the IDE extension and the ChatGPT desktop app (Codex mode)
// read ONE Codex home: $CODEX_HOME, defaulting to ~/.codex. Maestro installs
// into ~/.codex. When CODEX_HOME points elsewhere, the installed skills exist on
// disk but no Codex client loads them — and nothing errors. Maestro previously
// ignored CODEX_HOME completely, so this was undetectable.

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { resolveCodexHome, defaultCodexHome, desktopAppSupport, parseOsRelease } = require("../orquestrador/lib/codex-home");

test("unset CODEX_HOME is shared and not divergent", () => {
  const result = resolveCodexHome({ env: {}, home: "/home/user" });
  assert.equal(result.codexHome, path.join("/home/user", ".codex"));
  assert.equal(result.usesDefault, true);
  assert.equal(result.divergent, false);
  assert.match(result.message, /shared/i);
});

test("CODEX_HOME equal to the default home is not divergent", () => {
  const result = resolveCodexHome({ env: { CODEX_HOME: "/home/user/.codex" }, home: "/home/user" });
  assert.equal(result.divergent, false);
  assert.equal(result.usesDefault, false);
});

test("CODEX_HOME pointing elsewhere is flagged as divergent with an actionable message", () => {
  const result = resolveCodexHome({ env: { CODEX_HOME: "/tmp/other-codex" }, home: "/home/user" });
  assert.equal(result.divergent, true);
  assert.equal(result.codexHome, path.resolve("/tmp/other-codex"));
  assert.match(result.message, /will NOT see/i);
  assert.match(result.message, /CODEX_HOME/);
});

test("blank and whitespace CODEX_HOME fall back to the default", () => {
  for (const value of ["", "   "]) {
    const result = resolveCodexHome({ env: { CODEX_HOME: value }, home: "/home/user" });
    assert.equal(result.usesDefault, true, `blank value should fall back: ${JSON.stringify(value)}`);
    assert.equal(result.divergent, false);
  }
});

test("tilde CODEX_HOME is expanded before comparison", () => {
  const result = resolveCodexHome({ env: { CODEX_HOME: "~/.codex" }, home: "/home/user" });
  assert.equal(result.divergent, false, "~/.codex must expand to the default home");
});

test("defaultCodexHome matches the path Maestro installs into", () => {
  assert.equal(defaultCodexHome("/home/user"), path.join("/home/user", ".codex"));
});

test("desktop app support is reported per platform", () => {
  const mac = desktopAppSupport({ platform: "darwin", release: "15.3.0", arch: "arm64" });
  assert.equal(mac.supported, true);
  assert.match(mac.requirement, /macOS 14/);

  const macOld = desktopAppSupport({ platform: "darwin", release: "13.6.0", arch: "arm64" });
  assert.equal(macOld.supported, false, "macOS 13 must not be reported as supported");

  const win = desktopAppSupport({ platform: "win32", arch: "x64" });
  assert.equal(win.supported, true);
  assert.match(win.requirement, /17763/);
  assert.match(win.installHint, /winget/);
});

// The ChatGPT desktop app shipped for Linux in public preview on 2026-08-11
// (learn.chatgpt.com/docs/linux/linux-app + official release notes). These tests
// guard against regressing back to the "no Linux build" claim, which was wrong.
test("Linux desktop app is supported in preview on officially listed distros", () => {
  const cases = [
    ["ubuntu", "24.04", true],
    ["ubuntu", "26.04", true],
    ["debian", "13", true],
    ["fedora", "43", true],
    ["fedora", "44", true],
    ["arch", "", true]
  ];
  for (const [id, version, expected] of cases) {
    const result = desktopAppSupport({
      platform: "linux",
      arch: "x64",
      osReleaseText: `ID=${id}\nVERSION_ID="${version}"`
    });
    assert.equal(result.supported, expected, `${id} ${version} should be supported=${expected}`);
    assert.equal(result.preview, true, "Linux support is public preview");
  }
});

test("Linux distros outside the official list are reported as unsupported, not guessed", () => {
  const old = desktopAppSupport({
    platform: "linux",
    osReleaseText: 'ID=ubuntu\nVERSION_ID="22.04"'
  });
  assert.equal(old.supported, false, "Ubuntu 22.04 is not in the official preview list");
  assert.match(old.note, /may still work/i);

  const unknown = desktopAppSupport({ platform: "linux", osReleaseText: 'ID=mint\nVERSION_ID="21"' });
  assert.equal(unknown.supported, false);
  assert.match(unknown.requirement, /Ubuntu 24\.04/);

  const noRelease = desktopAppSupport({ platform: "linux", osReleaseText: "" });
  assert.equal(noRelease.supported, false, "unknown distro must not be claimed as supported");
  assert.equal(noRelease.preview, true);
});

test("Linux hints use the right package manager per distro", () => {
  const deb = desktopAppSupport({ platform: "linux", osReleaseText: 'ID=debian\nVERSION_ID="13"' });
  assert.match(deb.installHint, /apt install/);

  const rpm = desktopAppSupport({ platform: "linux", osReleaseText: 'ID=fedora\nVERSION_ID="44"' });
  assert.match(rpm.installHint, /dnf install/);

  const arch = desktopAppSupport({ platform: "linux", osReleaseText: "ID=arch" });
  assert.match(arch.installHint, /install-arch\.sh/);
});

test("Linux preview limitation about desktop app control is surfaced", () => {
  const deb = desktopAppSupport({ platform: "linux", osReleaseText: 'ID=debian\nVERSION_ID="13"' });
  assert.match(deb.note, /built-in browser or Chrome/i);
  assert.match(deb.note, /not yet supported/i);
});

test("parseOsRelease handles quotes and strips them", () => {
  const parsed = parseOsRelease('NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n\n# comment\nPRETTY_NAME=\'Ubuntu 24.04 LTS\'');
  assert.equal(parsed.ID, "ubuntu");
  assert.equal(parsed.VERSION_ID, "24.04");
  assert.equal(parsed.PRETTY_NAME, "Ubuntu 24.04 LTS");
});