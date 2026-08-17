"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { renderDashboard } = require("../index");
const { canStartMission, cockpitLayout, cockpitShortcut, firstInteractiveIndex, isInteractiveSession, primaryAction, terminalInputForKey, visibleSessions } = require("../ade-model");

test("TUI dashboard presents project-scoped operational state", () => {
  const output = renderDashboard({ name: "Omega", status: "healthy", path: "/work/omega" }, { runs: [{}], skills: [{ source: "maestro" }, { source: "user" }], terminals: [{}] });
  assert.match(output, /Omega · healthy/u);
  assert.match(output, /Runs: 1/u);
  assert.match(output, /Maestro 1 · Usuário 1/u);
});

test("global cockpit shortcuts remain active while project or mission navigation has focus", () => {
  for (const [name, action] of [["a", "agent"], ["m", "mission"], ["s", "shell"], ["f", "maximize"], ["x", "close"], ["q", "quit"]]) {
    assert.equal(cockpitShortcut({ name }, { textInput: false }), action);
  }
  assert.equal(cockpitShortcut({ name: "p", ctrl: true }, { textInput: true }), "projects");
  assert.equal(cockpitShortcut({ name: "q" }, { textInput: true }), null);
});

test("ADE layout prioritizes one pilot and pages specialists responsively", () => {
  assert.equal(cockpitLayout(160, 45).visiblePanels, 6);
  assert.equal(cockpitLayout(100, 32).visiblePanels, 4);
  assert.equal(cockpitLayout(70, 24).visiblePanels, 1);
  const sessions = Array.from({ length: 7 }, (_, index) => ({ id: `session-${index}` }));
  assert.deepEqual(visibleSessions(sessions, 6, cockpitLayout(160, 45)).map((entry) => entry.id), ["session-6"]);
});

test("cockpit guidance selects a connected PTY and explains the next mission action", () => {
  const sessions = [
    { id: "old", backend: "pty", status: "disconnected" },
    { id: "live", backend: "pty", status: "active" }
  ];
  assert.equal(firstInteractiveIndex(sessions), 1);
  assert.equal(isInteractiveSession(sessions[0]), false);
  assert.equal(isInteractiveSession(sessions[1]), true);
  assert.equal(canStartMission({ status: "draft" }), true);
  assert.match(primaryAction({ status: "draft" }, sessions[0], sessions), /Iniciar esta missão/u);
  assert.match(primaryAction({ status: "running" }, sessions[1], sessions), /Interagir/u);
});

test("terminal input normalizes control keys even when OpenTUI omits their sequence", () => {
  assert.equal(terminalInputForKey({ name: "return", sequence: "" }), "\r");
  assert.equal(terminalInputForKey({ name: "space", sequence: "" }), " ");
  assert.equal(terminalInputForKey({ name: "up", sequence: "" }), "\x1b[A");
  assert.equal(terminalInputForKey({ name: "c", ctrl: true, sequence: "" }), "\x03");
  assert.equal(terminalInputForKey({ name: "x", sequence: "x" }), "x");
});
