#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const roots = ["tests", "runtime"];
const files = [];

function collect(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.isFile() && entry.name.endsWith(".test.js")) files.push(path.relative(root, full));
  }
}

for (const directory of roots) collect(path.join(root, directory));
files.sort((a, b) => a.localeCompare(b));
if (files.length === 0) {
  console.error("No JavaScript test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
  shell: false
});
if (result.error) throw result.error;
process.exit(result.status === 0 ? 0 : result.status || 1);
