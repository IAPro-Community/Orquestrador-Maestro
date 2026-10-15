#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function resolveInvocation() {
  const pluginRoot = process.env.PLUGIN_ROOT || path.resolve(__dirname, "..");
  const repoCli = path.resolve(pluginRoot, "..", "..", "bin", "orquestrador-maestro.js");
  if (fs.existsSync(repoCli)) return { command: process.execPath, args: [repoCli, "desktop-mcp"] };
  return { command: process.env.MAESTRO_CLI || "orquestrador-maestro", args: ["desktop-mcp"] };
}

function main() {
  const invocation = resolveInvocation();
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    shell: false
  });
  child.once("error", (error) => {
    process.stderr.write(`Maestro desktop MCP unavailable: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = typeof code === "number" ? code : signal ? 1 : 0;
  });
}

main();
