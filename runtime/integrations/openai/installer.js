"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PLUGIN_NAME = "orquestrador-maestro";

function resolvePaths({ home = os.homedir(), packageRoot = path.resolve(__dirname, "..", "..", "..") } = {}) {
  return {
    home,
    source: path.join(packageRoot, "plugins", "maestro-openai"),
    destination: path.join(home, ".codex", "plugins", PLUGIN_NAME),
    marketplace: path.join(home, ".agents", "plugins", "marketplace.json")
  };
}

function readMarketplace(file) {
  if (!fs.existsSync(file)) return { name: "maestro-personal", plugins: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...parsed,
      name: parsed.name || "maestro-personal",
      plugins: Array.isArray(parsed.plugins) ? parsed.plugins : []
    };
  } catch (error) {
    const wrapped = new Error(`Invalid personal plugin marketplace: ${file}: ${error.message}`);
    wrapped.code = "INVALID_PLUGIN_MARKETPLACE";
    throw wrapped;
  }
}

function writeMarketplace(file, marketplace) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(marketplace, null, 2) + "\n", "utf8");
}

function marketplaceEntry() {
  return {
    name: PLUGIN_NAME,
    source: { source: "local", path: "./.codex/plugins/orquestrador-maestro" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Productivity"
  };
}

function installDesktopPlugin(options = {}) {
  const paths = resolvePaths(options);
  if (!fs.existsSync(path.join(paths.source, "plugin.json"))) {
    throw new Error(`Maestro desktop plugin source not found: ${paths.source}`);
  }
  fs.mkdirSync(path.dirname(paths.destination), { recursive: true });
  fs.rmSync(paths.destination, { recursive: true, force: true });
  fs.cpSync(paths.source, paths.destination, { recursive: true });

  const marketplace = readMarketplace(paths.marketplace);
  const plugins = marketplace.plugins.filter((plugin) => plugin?.name !== PLUGIN_NAME);
  plugins.push(marketplaceEntry());
  writeMarketplace(paths.marketplace, {
    ...marketplace,
    interface: marketplace.interface || { displayName: "Personal Plugins" },
    plugins
  });
  return { installed: true, ...paths, marketplaceName: marketplace.name };
}

function desktopPluginStatus(options = {}) {
  const paths = resolvePaths(options);
  const marketplace = readMarketplace(paths.marketplace);
  const entry = marketplace.plugins.find((plugin) => plugin?.name === PLUGIN_NAME) || null;
  return {
    installed: fs.existsSync(path.join(paths.destination, "plugin.json")),
    registered: Boolean(entry),
    destination: paths.destination,
    marketplace: paths.marketplace,
    marketplaceName: marketplace.name,
    entry
  };
}

function checkFile(root, relativePath, { json = false } = {}) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return { id: relativePath, pass: false, detail: "missing" };
  if (json) {
    try { JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) { return { id: relativePath, pass: false, detail: `invalid JSON: ${error.message}` }; }
  }
  return { id: relativePath, pass: true, detail: "ok" };
}

function desktopPluginDoctor(options = {}) {
  const paths = resolvePaths(options);
  const status = desktopPluginStatus(options);
  const root = status.installed ? paths.destination : paths.source;
  const checks = [
    { id: "installed", pass: status.installed, detail: status.installed ? paths.destination : "plugin is not installed" },
    { id: "registered", pass: status.registered, detail: status.registered ? paths.marketplace : "marketplace entry missing" },
    checkFile(root, "plugin.json", { json: true }),
    checkFile(root, ".codex-plugin/plugin.json", { json: true }),
    checkFile(root, "hooks/hooks.json", { json: true }),
    checkFile(root, "scripts/hook.js"),
    checkFile(root, "scripts/mcp.js"),
    checkFile(root, "mcp.json", { json: true }),
    checkFile(root, ".mcp.json", { json: true }),
    checkFile(root, "skills/maestro-governor/SKILL.md")
  ];

  try {
    const tempData = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-desktop-doctor-"));
    const { handleOpenAIHookEvent } = require("./adapter");
    const hook = handleOpenAIHookEvent({
      hook_event_name: "UserPromptSubmit",
      session_id: "doctor-session",
      turn_id: "doctor-turn",
      cwd: options.packageRoot || process.cwd(),
      prompt: "corrija um typo no README"
    }, {
      pluginData: tempData,
      mode: "optimize",
      route: () => ({
        profile: "fast",
        allSkills: [],
        complexity: {
          level: "MICRO",
          explicitMultiagent: false,
          budget: { maxContextTokens: 1500, allowSubagents: false }
        }
      })
    });
    checks.push({
      id: "synthetic-hook",
      pass: Boolean(hook?.hookSpecificOutput?.additionalContext),
      detail: hook?.hookSpecificOutput?.additionalContext ? "UserPromptSubmit produced bounded context" : "hook produced no context"
    });
    fs.rmSync(tempData, { recursive: true, force: true });
  } catch (error) {
    checks.push({ id: "synthetic-hook", pass: false, detail: error.message });
  }

  try {
    const { toolDefinitions } = require("./mcp-server");
    const names = toolDefinitions().map((tool) => tool.name).sort();
    const expected = ["maestro_context", "maestro_route", "maestro_skill"];
    checks.push({
      id: "mcp-tools",
      pass: JSON.stringify(names) === JSON.stringify(expected),
      detail: names.join(", ")
    });
  } catch (error) {
    checks.push({ id: "mcp-tools", pass: false, detail: error.message });
  }

  const failed = checks.filter((check) => !check.pass);
  return {
    healthy: failed.length === 0,
    checks,
    failed: failed.map((check) => check.id),
    hookTrust: "runtime-review-required",
    note: "Codex/Work must trust the current plugin hook definition; the CLI cannot force or bypass that review."
  };
}

function desktopPluginStats({ pluginData = process.env.PLUGIN_DATA || null, sessionId = null } = {}) {
  if (!pluginData) {
    return {
      available: false,
      reason: "PLUGIN_DATA is not available. Run inside the plugin runtime or pass --plugin-data PATH."
    };
  }

  if (sessionId) {
    const { ledgerStats } = require("./context-ledger");
    return { available: true, pluginData, session: ledgerStats(pluginData, sessionId) };
  }

  const directory = path.join(pluginData, "ledger");
  if (!fs.existsSync(directory)) {
    return { available: true, pluginData, sessions: 0, counters: {}, recent: [] };
  }

  const ledgers = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try { return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);

  const counters = {};
  for (const ledger of ledgers) {
    for (const [key, value] of Object.entries(ledger.counters || {})) {
      counters[key] = (Number(counters[key]) || 0) + (Number(value) || 0);
    }
  }

  const recent = ledgers
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, 10)
    .map((ledger) => ({
      complexity: ledger.complexity || null,
      profile: ledger.profile || null,
      selectedSkills: ledger.selectedSkills || [],
      counters: ledger.counters || {},
      updatedAt: ledger.updatedAt || null,
      endedAt: ledger.endedAt || null
    }));

  return { available: true, pluginData, sessions: ledgers.length, counters, recent };
}

function removeDesktopPlugin(options = {}) {
  const paths = resolvePaths(options);
  fs.rmSync(paths.destination, { recursive: true, force: true });
  const marketplace = readMarketplace(paths.marketplace);
  const plugins = marketplace.plugins.filter((plugin) => plugin?.name !== PLUGIN_NAME);
  writeMarketplace(paths.marketplace, { ...marketplace, plugins });
  return { installed: false, registered: false, destination: paths.destination, marketplace: paths.marketplace };
}

module.exports = {
  PLUGIN_NAME,
  desktopPluginDoctor,
  desktopPluginStats,
  desktopPluginStatus,
  installDesktopPlugin,
  marketplaceEntry,
  readMarketplace,
  removeDesktopPlugin,
  resolvePaths,
  writeMarketplace
};
