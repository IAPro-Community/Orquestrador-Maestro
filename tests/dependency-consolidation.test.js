"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("site React and React DOM versions remain paired in manifest and lock", () => {
  const manifest = require("../site/package.json");
  const lock = require("../site/package-lock.json").packages;
  const react = manifest.dependencies.react;
  assert.equal(react, manifest.dependencies["react-dom"]);
  for (const name of ["react", "react-dom"]) {
    assert.equal(lock[""].dependencies[name], react);
    assert.equal(lock["node_modules/" + name].version, react);
  }
});

test("root and benchmark use one TypeScript major and declare Node types", () => {
  const root = require("../package-lock.json").packages;
  const bench = require("../benchmark-harness/package-lock.json").packages;
  assert.equal(root["node_modules/typescript"].version, bench["node_modules/typescript"].version);
  assert.ok(require("../benchmark-harness/tsconfig.json").compilerOptions.types.includes("node"));
});

test("UUID dev dependency loads through CommonJS and ESM without changing notifier override", async () => {
  const root = require("../package.json");
  const lock = require("../package-lock.json").packages;
  const notifierUuid = lock["node_modules/node-notifier/node_modules/uuid"] || lock["node_modules/uuid"];
  assert.equal(notifierUuid.version, root.overrides["node-notifier"].uuid);
  const commonjs = require("uuid");
  const esm = await import("uuid");
  for (const api of [commonjs, esm]) {
    const value = api.v4();
    assert.equal(api.validate(value), true);
    assert.equal(api.version(value), 4);
  }
  assert.equal(typeof require("node-notifier").notify, "function");
});
