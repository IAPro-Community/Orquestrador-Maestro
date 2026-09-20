#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildInventory } = require("../runtime/skills/discovery");

function parseArgs(argv) {
  const result = { homePath: os.homedir(), maestroRoot: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--home-path") result.homePath = argv[++index];
    else if (arg === "--maestro-root") result.maestroRoot = argv[++index];
    else if (arg === "--output") result.output = argv[++index];
    else if (arg === "--help" || arg === "-h") result.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/discover-skills.js [--home-path PATH] [--maestro-root PATH] [--output PATH]");
    return;
  }
  const homePath = path.resolve(options.homePath || os.homedir());
  const maestroRoot = options.maestroRoot ? path.resolve(options.maestroRoot) : fs.existsSync(path.join(homePath, ".orquestrador-maestro"))
    ? path.join(homePath, ".orquestrador-maestro")
    : path.join(homePath, ".orquestrador");
  const output = path.resolve(options.output || path.join(maestroRoot, "SKILLS_DISCOVERY.json"));
  const inventory = buildInventory({ userHome: homePath, maestroRoot });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  console.log(`Skill inventory refreshed: ${inventory.counts.invokableSkills} invokable skills from ${inventory.counts.discoveredSkillFiles} skill files.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
