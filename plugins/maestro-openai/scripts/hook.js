#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function resolveInvocation() {
  const pluginRoot = process.env.PLUGIN_ROOT || path.resolve(__dirname, "..");
  const repoCli = path.resolve(pluginRoot, "..", "..", "bin", "orquestrador-maestro.js");
  if (fs.existsSync(repoCli)) return { command: process.execPath, args: [repoCli, "desktop-hook"] };
  return { command: process.env.MAESTRO_CLI || "orquestrador-maestro", args: ["desktop-hook"] };
}

function main() {
  const input = fs.readFileSync(0, "utf8");
  if (!input.trim()) return 0;
  const invocation = resolveInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    input,
    encoding: "utf8",
    env: process.env,
    timeout: 4500,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    shell: false
  });
  if (result.error || result.status !== 0) {
    if (process.env.MAESTRO_OPENAI_DEBUG === "1") {
      process.stderr.write(String(result.error?.message || result.stderr || "Maestro desktop-hook unavailable") + "\n");
    }
    return 0;
  }
  if (result.stdout && result.stdout.trim()) process.stdout.write(result.stdout.trim() + "\n");
  return 0;
}

process.exitCode = main();
