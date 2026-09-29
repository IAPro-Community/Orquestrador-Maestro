"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const { LocalMaestroClient, MAESTRO_CLIENT_INTERFACE, MaestroClientError } = require("../runtime/client/maestro-client");
const { SocketMaestroClient } = require("../runtime/client/socket-maestro-client");

test("both transports expose the same TUI-facing contract", () => {
  for (const Client of [LocalMaestroClient, SocketMaestroClient]) {
    for (const name of Object.keys(MAESTRO_CLIENT_INTERFACE)) assert.equal(typeof Client.prototype[name], "function", `${Client.name}.${name}`);
  }
  const error = new MaestroClientError("invalid_payload"); assert.equal(error.reason, "invalid_payload");
});

test("CLI integration hot file remains independent from the new protocol modules", () => {
  for (const file of ["bin/orquestrador-maestro.js"]) {
    const contents = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(contents, /runtime\/(?:client|protocol|events)\//, file);
  }
});

test("local transport delivers mission event then reflects it in snapshot", async () => {
  const emitter = new EventEmitter(); const events = [];
  const store = { listEvents: async () => events, getRun: async () => undefined, getTask: async () => undefined };
  const app = {
    store, subscribe(fn) { emitter.on("event", fn); return () => emitter.off("event", fn); },
    async createMission(payload) { const mission = { id: "m1", ...payload }; const event = { id: "e1", type: "mission.created", occurredAt: new Date().toISOString(), data: { missionId: mission.id } }; events.push(event); emitter.emit("event", event); return mission; },
    async listProjects() { return []; }, async listMissions() { return []; }, async listRuns() { return []; }, async createRun() {}, async executeRun() {}, async cancelRun() {}, async listProviders() { return []; }, skills: { list() { return []; } }, async listTerminalSessions() { return []; }, async createTerminalSession() {}, async closeTerminalSession() {}
  };
  const client = new LocalMaestroClient({ app }); const received = new Promise((resolve) => client.subscribe(resolve));
  await client.createMission({ objective: "UTF-8 íntegro" }); assert.equal((await received).family, "mission.*");
  assert.equal((await client.snapshot()).streams["mission.*"].length, 1);
});
