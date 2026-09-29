"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("ownership map covers every persistent mutation and is deeply frozen", () => {
  const { OWNERSHIP_MAP } = require("../runtime/ownership/ownership-map");
  const source = fs.readFileSync(path.join(__dirname, "..", "runtime/store/run-store.js"), "utf8");
  const storeMutations = [...source.matchAll(/async ((?:create|save|append)[A-Z]\w*)\(/g)].map((match) => match[1]);
  const covered = new Set(OWNERSHIP_MAP.canonicalWriters.flatMap((entry) => entry.storeMethods));
  assert.deepEqual(storeMutations.filter((method) => !covered.has(method)), []);
  assert.ok(Object.isFrozen(OWNERSHIP_MAP));
  assert.ok(OWNERSHIP_MAP.readOnlyConsumers.includes("bin/orquestrador-maestro.js (read paths)"));
});

test("bin does not instantiate or mutate the run store directly", () => {
  const files = ["bin/orquestrador-maestro.js"];
  const forbidden = /JsonFileRunStore|new\s+RunStore|\.store\.(?:create|save|append)[A-Z]|appendEvent\s*\(/;
  for (const relative of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
    assert.doesNotMatch(source, forbidden, relative);
  }
});

test("bridge mutation routes target runtime services, never a run store", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "runtime/bridge/bridge.js"), "utf8");
  for (const method of ["projects.register", "missions.create", "missions.update", "runs.create", "runs.cancel", "terminals.create", "panes.updateLayout"]) {
    const line = source.split("\n").find((entry) => entry.includes(`\"${method}\"`));
    assert.match(line, /services\.runtime/);
    assert.doesNotMatch(line, /services\.runStore/);
  }
});
