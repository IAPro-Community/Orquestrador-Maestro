"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { applyManagedSkill, applyBatch, inspectRoot, STATE_FILE } = require("../orquestrador/bin/sync-managed-skill");

function fixture() {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "maestro-native-skill-")));
  const source = path.join(home, "package", "skill-example");
  const root = path.join(home, ".agents", "skills");
  const destination = path.join(root, "skill-example");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  return { home, source, root, destination };
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function apply({ source, root, destination, artifactsDirectory, previousRoot }) {
  return applyManagedSkill({
    program: "agents",
    source,
    destination,
    targetRoot: root,
    artifactsDirectory,
    previousRoot,
  });
}

test("native mirror updates unchanged official trees and snapshots the previous copy", () => {
  const { home, source, root, destination } = fixture();
  write(source, "SKILL.md", "official v1\n");
  assert.equal(apply({ source, root, destination }).action, "copied");
  assert.ok(fs.existsSync(path.join(root, STATE_FILE)));

  write(source, "SKILL.md", "official v2\n");
  write(source, "reference.md", "new official file\n");
  const result = apply({ source, root, destination });
  assert.equal(result.action, "updated");
  assert.equal(fs.readFileSync(path.join(destination, "SKILL.md"), "utf8"), "official v2\n");
  assert.equal(fs.readFileSync(path.join(destination, "reference.md"), "utf8"), "new official file\n");
  const report = JSON.parse(fs.readFileSync(result.reportPath, "utf8"));
  assert.equal(report.operations[0].action, "updated");
  assert.ok(report.operations[0].previousCopy);
  const before = path.join(path.dirname(result.reportPath), ...report.operations[0].previousCopy.split("/"));
  assert.equal(fs.readFileSync(path.join(before, "SKILL.md"), "utf8"), "official v1\n");
});

test("native mirror preserves modified official files and user additions with an upstream copy", () => {
  const { home, source, root, destination } = fixture();
  write(source, "SKILL.md", "official v1\n");
  assert.equal(apply({ source, root, destination }).action, "copied");
  write(path.join(destination), "SKILL.md", "user customized\n");
  write(path.join(destination), "private-notes.md", "user notes\n");
  write(source, "SKILL.md", "official v2\n");
  write(source, "new-reference.md", "upstream addition\n");
  const artifactsDirectory = path.join(home, "backup", "update-artifacts", "native-skills");

  const result = apply({ source, root, destination, artifactsDirectory });
  assert.equal(result.action, "preserved-customization");
  assert.equal(fs.readFileSync(path.join(destination, "SKILL.md"), "utf8"), "user customized\n");
  assert.equal(fs.readFileSync(path.join(destination, "private-notes.md"), "utf8"), "user notes\n");
  const report = JSON.parse(fs.readFileSync(result.reportPath, "utf8"));
  assert.ok(report.operations[0].upstreamCopy);
  assert.deepEqual(inspectRoot(root).customizations, ["skill-example"]);
  const upstream = path.join(artifactsDirectory, ...report.operations[0].upstreamCopy.split("/"));
  assert.equal(fs.readFileSync(path.join(upstream, "SKILL.md"), "utf8"), "official v2\n");
  assert.equal(fs.readFileSync(path.join(upstream, "new-reference.md"), "utf8"), "upstream addition\n");

  write(source, "SKILL.md", "official v3\n");
  assert.equal(apply({ source, root, destination, artifactsDirectory }).action, "preserved-customization");
  assert.equal(fs.readFileSync(path.join(destination, "SKILL.md"), "utf8"), "user customized\n");
  assert.deepEqual(inspectRoot(root).customizations, ["skill-example"]);
});

test("unversioned mirrors matching the backed-up source update, but differing trees are preserved", () => {
  const { home, source, root, destination } = fixture();
  const previousRoot = path.join(home, "backup", ".orquestrador");
  write(path.join(previousRoot, "skills", "skill-example"), "SKILL.md", "old official\n");
  fs.cpSync(path.join(previousRoot, "skills", "skill-example"), destination, { recursive: true });
  write(source, "SKILL.md", "new official\n");
  const updated = apply({ source, root, destination, previousRoot });
  assert.equal(updated.action, "updated");
  assert.equal(fs.readFileSync(path.join(destination, "SKILL.md"), "utf8"), "new official\n");

  const customized = path.join(root, "skill-custom");
  const customSource = path.join(home, "package", "skill-custom");
  fs.mkdirSync(customized);
  fs.mkdirSync(customSource);
  write(customized, "SKILL.md", "unknown local version\n");
  write(customSource, "SKILL.md", "new packaged skill\n");
  const preserved = apply({ source: customSource, root, destination: customized, previousRoot });
  assert.equal(preserved.action, "preserved-customization");
  assert.equal(fs.readFileSync(path.join(customized, "SKILL.md"), "utf8"), "unknown local version\n");
});

test("native mirror rejects unsupported state instead of replacing it", () => {
  const { source, root, destination } = fixture();
  write(source, "SKILL.md", "official\n");
  write(destination, "SKILL.md", "local\n");
  fs.writeFileSync(path.join(root, STATE_FILE), JSON.stringify({ version: 99, skills: {} }));
  assert.throws(() => apply({ source, root, destination }), /Unsupported skill sync state/);
  assert.equal(fs.readFileSync(path.join(destination, "SKILL.md"), "utf8"), "local\n");
});

test("native batch records complete previous state and reports unchanged skills", () => {
  const { home, source, root, destination } = fixture();
  write(source, "SKILL.md", "official v1\n");
  assert.equal(apply({ source, root, destination }).action, "copied");
  const beforeState = fs.readFileSync(path.join(root, STATE_FILE), "utf8");
  write(source, "SKILL.md", "official v2\n");
  const artifactsDirectory = path.join(home, "backup", "update-artifacts", "native-skills");
  const results = applyBatch([{
    program: "agents",
    skill: "skill-example",
    source,
    destination,
    targetRoot: root,
    artifactsDirectory,
  }]);
  assert.deepEqual(results.map(({ action }) => action), ["updated"]);
  assert.equal(fs.readFileSync(path.join(artifactsDirectory, "native-skill-state-before", "agents.json"), "utf8"), beforeState);
  const report = JSON.parse(fs.readFileSync(path.join(artifactsDirectory, "native-skills-report.json"), "utf8"));
  assert.equal(report.operations.length, 1);
  assert.equal(report.operations[0].action, "updated");
});
