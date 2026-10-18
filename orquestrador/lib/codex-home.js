"use strict";

// 1.1.0: Codex home resolution and desktop-app parity.
//
// The Codex CLI, the IDE extension and the ChatGPT desktop app (Codex mode)
// all read ONE Codex home: $CODEX_HOME, defaulting to ~/.codex. Maestro writes
// skills/agents/prompts into ~/.codex, so when CODEX_HOME is set to a DIFFERENT
// directory the desktop app silently reads that other home and never sees the
// skills Maestro installed — a failure with no error anywhere.
//
// Maestro previously ignored CODEX_HOME entirely. This module makes the
// resolution explicit so doctor/verify can report the divergence.

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

function expandHome(value, home) {
  if (!value) return "";
  let out = String(value);
  if (out === "~") out = home;
  else if (out.startsWith("~/") || out.startsWith("~\\")) out = path.join(home, out.slice(2));
  return out;
}

function defaultCodexHome(home) {
  return path.join(home, ".codex");
}

/**
 * Resolve the effective Codex home for this environment.
 * @returns {{codexHome: string, envValue: string|null, usesDefault: boolean, divergent: boolean, message: string}}
 */
function resolveCodexHome({ env = process.env, home = os.homedir() } = {}) {
  const raw = env.CODEX_HOME && String(env.CODEX_HOME).trim() !== "" ? String(env.CODEX_HOME).trim() : null;
  const fallback = defaultCodexHome(home);
  if (!raw) {
    return {
      codexHome: fallback,
      envValue: null,
      usesDefault: true,
      divergent: false,
      message: "CODEX_HOME is not set; Codex CLI and the ChatGPT desktop app both default to ~/.codex (shared)."
    };
  }
  const resolved = path.resolve(expandHome(raw, home));
  const fallbackResolved = path.resolve(fallback);
  const divergent = resolved !== fallbackResolved;
  return {
    codexHome: resolved,
    envValue: raw,
    usesDefault: false,
    divergent,
    message: divergent
      ? `CODEX_HOME points to "${resolved}" but Maestro installed into "${fallbackResolved}". The ChatGPT desktop app and the Codex CLI read CODEX_HOME, so they will NOT see the Maestro skills. Set CODEX_HOME identically for every client, or unset it everywhere.`
      : `CODEX_HOME resolves to "${resolved}", the same directory Maestro writes to (shared with the ChatGPT desktop app).`
  };
}

/**
 * Where the ChatGPT desktop app can and cannot run. Reported, never enforced:
 * Maestro never installs third-party desktop apps.
 */
function desktopAppSupport({ platform = process.platform, release, arch = process.arch, osReleaseText } = {}) {
  const base = { platform, arch };
  if (platform === "darwin") {
    const version = typeof release === "string" ? parseInt(release.split(".")[0], 10) : null;
    const okMac = version !== null && version >= 14;
    return {
      ...base,
      supported: okMac,
      requirement: "macOS 14 or newer (Apple Silicon or Intel).",
      note: okMac
        ? "ChatGPT desktop app (Codex mode) can run here."
        : "ChatGPT desktop app requires macOS 14 or newer. Install the Codex CLI instead.",
      installHint: "Download from https://chatgpt.com/download or run `codex app` from the Codex CLI."
    };
  }
  if (platform === "win32") {
    return {
      ...base,
      supported: true,
      requirement: "Windows 10 build 17763.0 or newer (x64 or arm64).",
      note: "ChatGPT desktop app (Codex mode) can run here and uses %USERPROFILE%\\.codex.",
      installHint: "Microsoft Store, or: winget install --id=9PLM9XGG6VKS -s msstore"
    };
  }
  return { ...base, ...linuxSupport(osReleaseText !== undefined ? osReleaseText : readOsRelease()) };
}

// Linux desktop app shipped in public preview on 2026-08-11 (verified against
// learn.chatgpt.com/docs/linux/linux-app and the official release notes).
// Only these distro versions are officially supported; others may work but are
// not formally supported, so they are reported honestly instead of guessed.
const LINUX_SUPPORTED_DISTROS = {
  ubuntu: new Set(["24.04", "26.04"]),
  debian: new Set(["13"]),
  fedora: new Set(["43", "44"]),
  arch: new Set()
};

function parseOsRelease(text) {
  const out = {};
  for (const line of String(text || "").split("\n")) {
    const m = /^\s*([A-Za-z_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    out[m[1].toUpperCase()] = v;
  }
  return out;
}

function readOsRelease() {
  try {
    return fs.readFileSync("/etc/os-release", "utf8");
  } catch {
    return "";
  }
}

function linuxSupport(osReleaseText) {
  const info = parseOsRelease(osReleaseText);
  const id = String(info.ID || "").toLowerCase();
  const version = String(info.VERSION_ID || "").trim();
  const label = id ? `${id}${version ? " " + version : ""}` : "this Linux distribution";
  const versions = LINUX_SUPPORTED_DISTROS[id];

  if (!versions) {
    return {
      supported: false,
      preview: true,
      distro: id || null,
      requirement: "Ubuntu 24.04 LTS / 26.04 LTS, Debian 13, Fedora 43 / 44, or current Arch.",
      note: `The ChatGPT desktop app is available for Linux (public preview), but ${label} is not an officially supported distro. It may still work.`,
      installHint: "See https://learn.chatgpt.com/docs/linux/linux-app"
    };
  }
  if (versions.size > 0 && !versions.has(version)) {
    return {
      supported: false,
      preview: true,
      distro: id,
      requirement: `${label === id ? id : label} ${Array.from(versions).join(" or ")} for the Linux preview.`,
      note: `The ChatGPT desktop app Linux preview does not officially support ${label}. It may still work.`,
      installHint: "See https://learn.chatgpt.com/docs/linux/linux-app"
    };
  }
  const installHint =
    id === "ubuntu" || id === "debian"
      ? "Download the .deb for your architecture, then: sudo apt install ./chatgpt_amd64.deb (arm64: chatgpt_arm64.deb)"
      : id === "fedora"
        ? "Download the .rpm, then: sudo dnf install ./chatgpt.x86_64.rpm (arm64: chatgpt.aarch64.rpm)"
        : "curl -fsSL -o install-arch.sh https://persistent.oaistatic.com/codex-app-prod/linux/install-arch.sh && sudo bash install-arch.sh";

  return {
    supported: true,
    preview: true,
    distro: id || null,
    requirement: "Ubuntu 24.04 LTS / 26.04 LTS, Debian 13, Fedora 43 / 44, or current Arch.",
    note: `ChatGPT desktop app (Codex mode) runs here in public preview on ${label}. Browser actions work in the built-in browser or Chrome; controlling other desktop apps is not yet supported on Linux.`,
    installHint
  };
}

/**
 * True when the given directory looks like a Codex home that Maestro populated.
 */
function hasMaestroSkills(codexHome) {
  try {
    return fs.existsSync(path.join(codexHome, "skills"));
  } catch {
    return false;
  }
}

module.exports = { resolveCodexHome, defaultCodexHome, desktopAppSupport, parseOsRelease, hasMaestroSkills };