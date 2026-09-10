"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { interactionContract, loadInteractionCatalog, resetInteractionProfile, resolveInteractionProfile, setInteractionProfile } = require("../runtime/interaction");
const { projectProgress } = require("../runtime/progress");

test("interaction catalog is strict and exposes only default and focus", () => {
  const catalog = loadInteractionCatalog();
  assert.deepEqual(Object.keys(catalog.profiles), ["default", "focus"]);
  assert.equal(catalog.profiles.focus.timeEstimate, "telemetry-only");
});

test("interaction precedence and reset preserve unrelated configuration", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-interaction-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-home-"));
  fs.mkdirSync(path.join(home, ".orquestrador-maestro"), { recursive: true });
  fs.writeFileSync(path.join(home, ".orquestrador-maestro", "config.json"), JSON.stringify({ interactionProfile: "focus", mode: "strict" }));
  assert.equal(resolveInteractionProfile({ cwd: project, home }).id, "focus");
  setInteractionProfile({ cwd: project, home, id: "default" });
  assert.equal(resolveInteractionProfile({ cwd: project, home }).source, "project");
  assert.equal(resolveInteractionProfile({ cwd: project, home, cliProfile: "focus" }).source, "cli");
  resetInteractionProfile({ cwd: project, home });
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, ".orquestrador-maestro", "config.json"))).mode, undefined);
  assert.equal(resolveInteractionProfile({ cwd: project, home }).id, "focus");
});

test("default is pass-through and focus injects only the compact contract", () => {
  assert.equal(interactionContract({ id: "default" }), "");
  assert.match(interactionContract({ id: "focus" }), /maximum visible working set: 5/);
});

test("progress projection derives ordered current, completed, next, and gates", () => {
  const result = projectProgress({
    workflowState: { taskId: "task/demo", workflow: "demo", currentStep: "execute", status: "running", gates: { tests: "pending" }, approvals: [] },
    workflowLock: { taskId: "task/demo", workflow: "demo", resolved: { phases: [{ id: "execute" }], steps: [{ id: "plan", title: "Plan" }, { id: "execute", title: "Execute" }, { id: "verify", title: "Verify" }] } },
    interactionProfile: { id: "focus", source: "project" }
  });
  assert.equal(result.completed, 1); assert.equal(result.current.title, "Execute"); assert.equal(result.next.title, "Verify"); assert.deepEqual(result.gates, { tests: "pending" });
});
