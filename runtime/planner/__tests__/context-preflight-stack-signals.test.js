"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { gatherPreflight } = require("../context-preflight");
const { ContextEngine } = require("../../context/context-engine");

function temporaryProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-harness-signals-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("Java Maven root is discovered without claiming a test was run", async (t) => {
  const project = temporaryProject(t);
  fs.writeFileSync(path.join(project, "pom.xml"), "<project></project>\n");
  const facts = gatherPreflight(project, "Prepare grade-entry UI");
  assert.equal(facts.stack, "Java");
  assert.equal(facts.stackSourcePath, "pom.xml");
  assert.equal(facts.hasTests, false);
  assert.deepEqual(facts.buildSignals, [
    { path: "pom.xml", stack: "Java", tool: "Maven" }
  ]);
  const items = await new ContextEngine({ workspacePath: project })._discoverFacts("grade-entry");
  const stack = items.find((item) => item.key === "backend.framework");
  assert.deepEqual(stack.sources, [{ type: "build-marker", path: "pom.xml" }]);
});

test("mixed React + Java project preserves existing Node classification and reports both sources", (t) => {
  const project = temporaryProject(t);
  fs.writeFileSync(path.join(project, "package.json"),
    JSON.stringify({ name: "school-suite", dependencies: { react: "19.0.0" },
      scripts: { test: "node --test" } }));
  fs.writeFileSync(path.join(project, "pom.xml"), "<project></project>\n");
  const facts = gatherPreflight(project, "Build a form");
  assert.equal(facts.stack, "React");
  assert.equal(facts.framework, null);
  assert.equal(facts.stackSourcePath, "package.json");
  assert.equal(facts.projectNameSourcePath, "package.json");
  assert.equal(facts.hasTests, true);
  assert.deepEqual(facts.buildSignals.map((item) => item.path), ["package.json", "pom.xml"]);
});

test("ambiguous or non-regular build markers are not promoted to an invented primary stack", (t) => {
  const project = temporaryProject(t);
  fs.writeFileSync(path.join(project, "pom.xml"), "<project></project>");
  fs.writeFileSync(path.join(project, "pyproject.toml"), "[project]\n");
  fs.mkdirSync(path.join(project, "Cargo.toml")); // Directory is not a manifest.
  const facts = gatherPreflight(project, "Review architectures");
  assert.equal(facts.stack, null);
  assert.equal(facts.stackSourcePath, null);
  assert.deepEqual(facts.buildSignals.map((item) => item.path), ["pom.xml", "pyproject.toml"]);
  assert.equal(facts.hasTests, false);
});
