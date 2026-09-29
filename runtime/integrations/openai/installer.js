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
  desktopPluginStatus,
  installDesktopPlugin,
  marketplaceEntry,
  readMarketplace,
  removeDesktopPlugin,
  resolvePaths,
  writeMarketplace
};
