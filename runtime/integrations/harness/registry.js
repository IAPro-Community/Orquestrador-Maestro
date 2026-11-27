"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { TOOL_DEFINITIONS } = require("../../../orquestrador/lib/tool-registry");
const { configPathExists, hasMaestroMarker } = require("../../../orquestrador/lib/tool-detector");

const SAFE_COMMAND = /^[a-zA-Z0-9._-]+$/;
const PRIORITIZED_HARNESSES = Object.freeze([
  "codex", "claude", "opencode", "gemini", "antigravity",
  "cursor", "windsurf", "grok", "freebuff", "mimo", "kimi"
]);

const HARNESS_SPECS = Object.freeze({
  codex: Object.freeze({
    displayName: "Codex",
    commands: ["codex"],
    surfaces: ["cli", "tui", "desktop", "headless"],
    nativeGoalSurface: "cli/tui (experimental interactive /goal)",
    maxSupportedLevel: "governed",
    adapterMode: "desktop-plugin-and-headless",
    capabilities: { protocol: true, skills: true, headlessExec: true, hooks: true, plugin: true, nativeGoalControl: false }
  }),
  claude: Object.freeze({
    displayName: "Claude Code",
    commands: ["claude"],
    surfaces: ["cli", "tui", "ide", "headless"],
    nativeGoalSurface: "tui/slash-commands",
    maxSupportedLevel: "governed",
    adapterMode: "settings-command-hooks",
    capabilities: { protocol: true, skills: true, headlessExec: true, hooks: true, plugin: false, nativeGoalControl: false }
  }),
  opencode: Object.freeze({
    displayName: "OpenCode",
    commands: ["opencode"],
    surfaces: ["cli", "tui", "desktop", "headless"],
    nativeGoalSurface: "tui/desktop (v2.2.1+)",
    maxSupportedLevel: "governed",
    adapterMode: "opencode-v2-plugin",
    capabilities: { protocol: true, skills: true, headlessExec: true, hooks: true, plugin: true, nativeGoalControl: false }
  }),
  gemini: Object.freeze({
    displayName: "Gemini CLI",
    commands: ["gemini"],
    surfaces: ["cli", "tui", "headless"],
    nativeGoalSurface: "none-verified",
    maxSupportedLevel: "governed",
    adapterMode: "settings-command-hooks",
    capabilities: { protocol: true, skills: true, headlessExec: false, hooks: true, plugin: false, nativeGoalControl: false }
  }),
  antigravity: Object.freeze({
    displayName: "Antigravity",
    commands: ["agy"],
    surfaces: ["cli", "ide", "headless"],
    nativeGoalSurface: "unknown",
    maxSupportedLevel: "portable",
    adapterMode: "portable-and-headless",
    capabilities: { protocol: true, skills: true, headlessExec: true, hooks: false, plugin: false, nativeGoalControl: false }
  }),
  cursor: Object.freeze({
    displayName: "Cursor",
    commands: [],
    surfaces: ["ide"],
    nativeGoalSurface: "none-verified",
    maxSupportedLevel: "portable",
    adapterMode: "portable-rules",
    capabilities: { protocol: true, skills: false, headlessExec: false, hooks: false, plugin: false, nativeGoalControl: false }
  }),
  windsurf: Object.freeze({
    displayName: "Windsurf",
    commands: [],
    surfaces: ["ide"],
    nativeGoalSurface: "none-verified",
    maxSupportedLevel: "portable",
    adapterMode: "portable-rules",
    capabilities: { protocol: true, skills: false, headlessExec: false, hooks: false, plugin: false, nativeGoalControl: false }
  }),
  grok: Object.freeze({
    displayName: "Grok CLI",
    commands: ["grok"],
    surfaces: ["cli", "headless"],
    nativeGoalSurface: "none-verified",
    maxSupportedLevel: "portable",
    adapterMode: "portable-profile",
    capabilities: { protocol: true, skills: false, headlessExec: false, hooks: false, plugin: false, nativeGoalControl: false }
  }),
  freebuff: Object.freeze({
    displayName: "Freebuff",
    commands: ["freebuff"],
    surfaces: ["cli", "desktop", "sdk"],
    nativeGoalSurface: "none-verified",
    maxSupportedLevel: "portable",
    adapterMode: "portable-agents-contract",
    capabilities: { protocol: true, skills: true, headlessExec: false, hooks: false, plugin: false, nativeGoalControl: false }
  }),
  mimo: Object.freeze({
    displayName: "Mimo Code",
    commands: ["mimo"],
    surfaces: ["cli"],
    nativeGoalSurface: "none-verified",
    maxSupportedLevel: "portable",
    adapterMode: "portable-profile",
    capabilities: { protocol: true, skills: false, headlessExec: false, hooks: false, plugin: false, nativeGoalControl: false }
  }),
  kimi: Object.freeze({
    displayName: "Kimi Code",
    commands: ["kimi"],
    surfaces: ["cli"],
    nativeGoalSurface: "none-verified",
    maxSupportedLevel: "portable",
    adapterMode: "portable-profile",
    capabilities: { protocol: true, skills: false, headlessExec: false, hooks: false, plugin: false, nativeGoalControl: false }
  })
});

// The doctor probes every harness command; several hosts install a dozen
// CLIs, and each miss pays the full spawn timeout. A per-process memo keeps
// repeated inspections cheap without changing results.
const probeCache = new Map();

function probeExecutable(command, probeCommand, cacheKey) {
  if (cacheKey && probeCache.has(cacheKey)) return probeCache.get(cacheKey);
  const result = probeCommand
    ? probeCommand(command)
    : defaultProbeCommand(command);
  if (cacheKey) probeCache.set(cacheKey, result);
  return result;
}

function defaultProbeCommand(command) {
  if (!command || !SAFE_COMMAND.test(command)) return { installed: false, version: null };
  try {
    const res = spawnSync(command, ["--version"], {
      encoding: "utf8",
      timeout: 2500,
      maxBuffer: 64 * 1024,
      shell: process.platform === "win32",
      windowsHide: true
    });
    if (res.error || res.status !== 0) return { installed: false, version: null };
    const line = String(res.stdout || res.stderr || "").split(/\r?\n/)[0]?.trim() || "";
    const version = line && line.length <= 128 ? line : "present";
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
}

function safeReadJson(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) return { exists: true, valid: false, value: null, symlink: stat.isSymbolicLink() };
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { exists: true, valid: Boolean(value && typeof value === "object" && !Array.isArray(value)), value, symlink: false };
  } catch (err) {
    if (err && err.code === "ENOENT") return { exists: false, valid: false, value: null, symlink: false };
    return { exists: true, valid: false, value: null, symlink: false };
  }
}

function inspectExecutableAdapterState(harnessId, { home, packageRoot }) {
  if (harnessId === "codex") {
    const { desktopPluginStatus } = require("../openai/installer");
    try {
      const status = desktopPluginStatus({ home, packageRoot });
      return {
        supported: true,
        installed: status.installed,
        registered: status.registered,
        healthy: status.installed && status.registered && status.versionMatch,
        configPath: status.marketplace,
        detail: status.installed ? (status.versionMatch ? "desktop-plugin-ready" : "desktop-plugin-version-mismatch") : "not-installed"
      };
    } catch {
      return { supported: true, installed: false, registered: false, healthy: false, configPath: null, detail: "marketplace-invalid" };
    }
  }
  if (harnessId === "claude" || harnessId === "gemini") {
    const settingsFile = path.join(home, harnessId === "claude" ? ".claude" : ".gemini", "settings.json");
    const parsed = safeReadJson(settingsFile);
    if (!parsed.exists) return { supported: true, installed: false, registered: false, healthy: false, configPath: settingsFile, detail: "settings-absent" };
    if (!parsed.valid) return { supported: true, installed: false, registered: false, healthy: false, configPath: settingsFile, detail: "settings-invalid" };
    const { renderHookConfig } = require("../../../scripts/harness-hook");
    // A package root that cannot be rendered as a shell-safe hook command is
    // not a crash: the adapter stays unconfigured and the reason is reported.
    // Only that exact code degrades; any other failure is a real defect and
    // must not be relabelled as an unsafe path.
    let expected;
    try {
      expected = renderHookConfig(harnessId, path.join(packageRoot, "scripts", "harness-hook.js")).hooks;
    } catch (error) {
      if (error?.code !== "HARNESS_PATH_NOT_SHELL_SAFE") throw error;
      return { supported: true, installed: false, registered: false, healthy: false, configPath: settingsFile, detail: "hook-path-not-shell-safe" };
    }
    const hooksObj = parsed.value.hooks && typeof parsed.value.hooks === "object" && !Array.isArray(parsed.value.hooks) ? parsed.value.hooks : null;
    if (!hooksObj) return { supported: true, installed: false, registered: false, healthy: false, configPath: settingsFile, detail: "hooks-absent" };
    const marker = `harness-hook.js" ${harnessId}`;
    const eventNames = Object.keys(expected);
    const matches = eventNames.every((eventName) => {
      const entries = hooksObj[eventName];
      return Array.isArray(entries) && entries.some((group) =>
        Array.isArray(group?.hooks) && group.hooks.some((h) => typeof h?.command === "string" && h.command.includes(marker)));
    });
    return {
      supported: true,
      installed: matches,
      registered: matches,
      healthy: matches,
      configPath: settingsFile,
      detail: matches ? "hooks-configured" : "hooks-not-configured"
    };
  }
  if (harnessId === "opencode") {
    const candidates = [
      path.join(home, ".config", "opencode", "opencode.json"),
      path.join(home, ".opencode", "opencode.json")
    ];
    const targetPluginDir = path.resolve(packageRoot, "tool-profiles", "opencode", "maestro-harness-v2");
    for (const candidate of candidates) {
      const parsed = safeReadJson(candidate);
      if (!parsed.exists) continue;
      if (!parsed.valid) return { supported: true, installed: false, registered: false, healthy: false, configPath: candidate, detail: "config-invalid" };
      const plugins = Array.isArray(parsed.value.plugins) ? parsed.value.plugins : [];
      const registered = plugins.some((entry) => typeof entry === "string" && path.resolve(entry) === targetPluginDir);
      const hasSdk = fs.existsSync(path.join(targetPluginDir, "node_modules", "@opencode", "plugin", "package.json"));
      if (registered) {
        return {
          supported: true,
          installed: true,
          registered: true,
          healthy: hasSdk,
          configPath: candidate,
          detail: hasSdk ? "opencode-v2-plugin-ready" : "opencode-sdk-install-required"
        };
      }
    }
    return { supported: true, installed: false, registered: false, healthy: false, configPath: candidates[0], detail: "plugin-not-configured" };
  }
  return { supported: false, installed: false, registered: false, healthy: false, configPath: null, detail: "portable-only" };
}

function loadCatalogAdapters(packageRoot) {
  try {
    const manifestPath = path.join(packageRoot, "orquestrador", "TOOL_ADAPTERS.json");
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return parsed?.adapters && typeof parsed.adapters === "object" ? parsed.adapters : {};
  } catch {
    return {};
  }
}

// Match the installed stable V2 API family; V1 uses a different plugin
// schema. The bundled SDK targets 2.4.1. Future major versions require review.
function supportsOpenCodeV2(version) {
  const match = /^(?:opencode\s+)?v?2\.(\d+)\.(\d+)$/iu.exec(String(version || "").trim());
  return Boolean(match && (Number(match[1]) > 4 || (Number(match[1]) === 4 && Number(match[2]) >= 1)));
}

function inspectHarness(harnessId, {
  home = os.homedir(),
  packageRoot = path.resolve(__dirname, "..", "..", ".."),
  probeCommand = defaultProbeCommand
} = {}) {
  const spec = HARNESS_SPECS[harnessId];
  const catalogAdapters = loadCatalogAdapters(packageRoot);
  const catalogAdapter = catalogAdapters[harnessId];
  const registryDef = TOOL_DEFINITIONS[harnessId];
  if (!spec && !catalogAdapter) {
    throw new TypeError(`Unknown harness id: ${harnessId}`);
  }
  const commands = spec?.commands || (catalogAdapter?.command ? [catalogAdapter.command] : []);
  let installed = false;
  let version = null;
  let commandFound = null;
  for (const cmd of commands) {
    // Cache key is per command, not per call: the same binary must not pay
    // the spawn timeout again for every harness that lists it.
    const probed = probeExecutable(cmd, probeCommand, `probe:${cmd}`);
    if (probed?.installed) {
      installed = true;
      version = probed.version || "present";
      commandFound = cmd;
      break;
    }
  }
  let configDetected = false;
  if (registryDef) {
    const cfg = configPathExists(harnessId, home);
    configDetected = Boolean(cfg?.exists && !hasMaestroMarker(home, harnessId));
  } else if (harnessId === "freebuff") {
    configDetected = fs.existsSync(path.join(home, ".agents", "skills"));
  }
  let adapterState = inspectExecutableAdapterState(harnessId, { home, packageRoot });
  if (harnessId === "opencode" && adapterState.registered && !supportsOpenCodeV2(version)) {
    adapterState = { ...adapterState, healthy: false, detail: "opencode-v2-version-unverified" };
  }
  const maxSupportedLevel = spec?.maxSupportedLevel || "portable";
  const compatibilityLevel = adapterState.installed && adapterState.healthy && maxSupportedLevel === "governed"
    ? "governed"
    : "portable";
  const unavailabilityReasons = [];
  if (!installed) unavailabilityReasons.push("BINARY_NOT_FOUND");
  if (installed && !version) unavailabilityReasons.push("VERSION_UNVERIFIED");
  if (!adapterState.supported) unavailabilityReasons.push("NO_OFFICIAL_EXECUTABLE_HOOK_CONTRACT");
  else if (!adapterState.installed) unavailabilityReasons.push("EXECUTABLE_ADAPTER_NOT_CONFIGURED");
  else if (!adapterState.healthy) unavailabilityReasons.push(`EXECUTABLE_ADAPTER_UNHEALTHY:${adapterState.detail}`);
  unavailabilityReasons.push("NATIVE_GOAL_LIFECYCLE_NOT_CERTIFIED");

  return Object.freeze({
    schemaVersion: 1,
    harnessId,
    displayName: spec?.displayName || catalogAdapter?.displayName || harnessId,
    prioritized: PRIORITIZED_HARNESSES.includes(harnessId),
    installed,
    command: commandFound || commands[0] || null,
    version,
    surfaces: Object.freeze([...(spec?.surfaces || catalogAdapter?.surfaces || ["cli"])]),
    configDetected,
    compatibilityLevel,
    maxSupportedLevel,
    adapterMode: spec?.adapterMode || "portable-adapter-blueprint",
    adapterState: Object.freeze(adapterState),
    nativeGoalSurface: spec?.nativeGoalSurface || "none-verified",
    continuationAuthority: "external-host",
    goalState: "unknown",
    capabilities: Object.freeze({ ...(spec?.capabilities || { protocol: true, skills: false, headlessExec: false, hooks: false, plugin: false, nativeGoalControl: false }) }),
    limits: Object.freeze({ hostOwnsTrust: true, noCompetingLoop: true, verificationIndependent: true }),
    unavailabilityReasons: Object.freeze(unavailabilityReasons)
  });
}

function inspectAllHarnesses(options = {}) {
  const packageRoot = options.packageRoot || path.resolve(__dirname, "..", "..", "..");
  const catalog = loadCatalogAdapters(packageRoot);
  const catalogIds = Object.keys(catalog).filter((id) => !["ollama", "lm-studio"].includes(id));
  const ids = options.ids || [...new Set([...PRIORITIZED_HARNESSES, ...catalogIds])];
  const entries = {};
  for (const id of ids) {
    entries[id] = inspectHarness(id, options);
  }
  return Object.freeze({
    schemaVersion: 1,
    inspectedAt: new Date().toISOString(),
    harnesses: Object.freeze(entries),
    summary: Object.freeze({
      total: ids.length,
      installed: ids.filter((id) => entries[id].installed).length,
      governedActive: ids.filter((id) => entries[id].compatibilityLevel === "governed").length,
      goalIntegrated: ids.filter((id) => entries[id].compatibilityLevel === "goal-integrated").length
    })
  });
}

module.exports = {
  PRIORITIZED_HARNESSES,
  HARNESS_SPECS,
  inspectHarness,
  inspectAllHarnesses,
  inspectExecutableAdapterState,
  defaultProbeCommand,
  probeExecutable,
  supportsOpenCodeV2
};
