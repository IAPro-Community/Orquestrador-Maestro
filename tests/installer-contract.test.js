"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

test("installer contract stays aligned with the published package", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const powershellBootstrap = fs.readFileSync(path.join(ROOT, "scripts", "bootstrap-install.ps1"), "utf8");
  const shellBootstrap = fs.readFileSync(path.join(ROOT, "scripts", "bootstrap-install.sh"), "utf8");
  const packageVersion = packageJson.version;

  assert.match(packageVersion, /^\d+\.\d+\.\d+$/u);
  assert.match(powershellBootstrap, new RegExp(`\\$packageVersion = "${packageVersion.replaceAll(".", "\\.")}"`));
  assert.match(shellBootstrap, new RegExp(`PACKAGE_VERSION="${packageVersion.replaceAll(".", "\\.")}"`));
});

test("source installer excludes local runtime state", () => {
  const installer = fs.readFileSync(path.join(ROOT, "scripts", "install.ps1"), "utf8");

  assert.match(installer, /isLocalRuntime/);
  assert.match(installer, /relativeDirectory.*runtime/s);
  assert.match(installer, /ReparsePoint/);
  assert.match(installer, /Get-TreeFiles/);
});

test("published package carries the public catalog and refreshes its installed inventory", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const powershellInstaller = fs.readFileSync(path.join(ROOT, "scripts", "install.ps1"), "utf8");
  const shellInstaller = fs.readFileSync(path.join(ROOT, "scripts", "install.sh"), "utf8");
  const publicManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "skill-library", "PUBLIC_SKILLS_MANIFEST.json"), "utf8"));

  assert.ok(packageJson.files.includes("codex/skills/"));
  assert.ok(packageJson.files.includes("skill-library/PUBLIC_SKILLS_MANIFEST.json"));
  assert.equal(publicManifest.counts.uniqueSkills, 75);
  assert.match(powershellInstaller, /discover-skills\.js/u);
  assert.match(shellInstaller, /discover-skills\.js/u);
  assert.doesNotMatch(powershellInstaller, /plugins[\\/]cache/u);
  assert.doesNotMatch(shellInstaller, /plugins\/cache/u);
});

test("desktop notifications keep a compatible notifier API and safe uuid override", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const notifier = require("node-notifier");

  assert.equal(typeof notifier.notify, "function");
  assert.equal(packageJson.overrides?.["node-notifier"]?.uuid, "11.1.1");
  assert.equal(require("uuid/package.json").version, "11.1.1");
});
