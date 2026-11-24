"use strict";
const fs = require("node:fs");
const path = require("node:path");

function checkReleaseVersion(root, expected) {
  const read = name => fs.readFileSync(path.join(root, name), "utf8");
  const json = name => JSON.parse(read(name));
  const version = json("package.json").version;
  if (typeof version !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new Error("Invalid release package version");
  }
  if (expected !== undefined && version !== expected) throw new Error("Requested version differs from package.json");
  const lock = json("package-lock.json");
  const values = {
    "package-lock.json": lock.version,
    "package-lock.json packages root": lock.packages?.[""]?.version,
    "plugins/maestro-openai/plugin.json": json("plugins/maestro-openai/plugin.json").version,
    "plugins/maestro-openai/.codex-plugin/plugin.json": json("plugins/maestro-openai/.codex-plugin/plugin.json").version,
    "docs/product/CAPABILITY_MATRIX.json": json("docs/product/CAPABILITY_MATRIX.json").product?.packageVersion,
    "scripts/bootstrap-install.sh": /^PACKAGE_VERSION="([^"]+)"/m.exec(read("scripts/bootstrap-install.sh"))?.[1],
    "scripts/bootstrap-install.ps1": /^\$packageVersion = "([^"]+)"/m.exec(read("scripts/bootstrap-install.ps1"))?.[1]
  };
  for (const [name, value] of Object.entries(values)) {
    if (value !== version) throw new Error("Release manifest mismatch: " + name);
  }
  if (!read("CHANGELOG.md").split(/\r?\n/).some(line => line === "## " + version || line.startsWith("## " + version + " "))) {
    throw new Error("Missing changelog heading for " + version);
  }
  return version;
}
if (require.main === module) {
  try { console.log(checkReleaseVersion(path.resolve(__dirname, ".."), process.argv[2])); }
  catch (error) { console.error("Release version gate: " + error.message); process.exitCode = 1; }
}
module.exports = { checkReleaseVersion };
