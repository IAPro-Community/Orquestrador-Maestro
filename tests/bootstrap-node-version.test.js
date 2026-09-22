"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("bootstrap installers enforce the package Node 20.19 minimum", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const sh = fs.readFileSync(path.join(root, "scripts", "bootstrap-install.sh"), "utf8");
  const ps = fs.readFileSync(path.join(root, "scripts", "bootstrap-install.ps1"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

  assert.equal(pkg.engines.node, ">=20.19.0");
  assert.match(sh, /major === 20 && minor >= 19/u);
  assert.match(sh, /Node\.js 20\.12 ou superior/u);
  assert.match(ps, /\$nodeMajor -eq 20 -and \$nodeMinor -lt 12/u);
  assert.match(ps, /Node\.js 20\.12 ou superior/u);
  assert.match(readme, /Node\.js 20\.12 ou superior/u);
});
