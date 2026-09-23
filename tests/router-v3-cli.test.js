"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const cli = path.join(repoRoot, "bin", "orquestrador-maestro.js");

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: path.join(repoRoot, ".test-home-router-v3"),
      USERPROFILE: path.join(repoRoot, ".test-home-router-v3")
    }
  });
}

test("route explain exposes Router v3 decision", () => {
  const result = run("route", "explain", "frontend-design");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Selected: skill-open-design-ui/u);
  assert.match(result.stdout, /Complexity:/u);
  assert.match(result.stdout, /Estimated context:/u);
});

test("route explain --json is machine readable", () => {
  const result = run("route", "explain", "--json", "ui-ux-pro-max");
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.routingVersion, 3);
  assert.equal(parsed.primarySkill.id, "skill-product-ux-architecture");
  assert.equal(parsed.complexity.level, "STANDARD");
});

test("route explain accepts explicit complexity override", () => {
  const result = run("route", "explain", "--json", "--complexity", "MICRO", "frontend-design");
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.complexity.level, "MICRO");
  assert.ok(parsed.complexity.evidence.some((item) =>
    item.kind === "explicit-override" && item.value === "MICRO"
  ));
});

test("route explain rejects invalid complexity override", () => {
  const result = run("route", "explain", "--complexity", "HUGE", "frontend-design");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /complexity override must be one of/u);
});
