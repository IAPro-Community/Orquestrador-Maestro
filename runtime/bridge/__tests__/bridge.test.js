"use strict";

const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createBridge, createStdioServer, PROTOCOL_VERSION, SocketBridgeClient, startSocketRuntime } = require("../index");

function request(id, method, params) {
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

test("initialize negotiates the versioned protocol", async () => {
  const bridge = createBridge();

  const response = await bridge.handle(request(1, "initialize", { protocolVersion: PROTOCOL_VERSION }));

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: 1,
      serverInfo: { name: "maestro-bridge" },
      capabilities: { subscriptions: true, approvals: false }
    }
  });
});

test("authenticated socket subscribers receive runtime events without polling", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-socket-events-"));
  const events = new EventEmitter();
  const bridge = createBridge({ projectRoot, services: { runtime: { subscribe: (listener) => { events.on("event", listener); return () => events.off("event", listener); } } } });
  const runtime = startSocketRuntime(bridge, { projectRoot });
  const client = new SocketBridgeClient({ projectRoot });
  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("event subscription timed out")), 1_000);
    const unsubscribe = client.subscribe((event) => { if (event.type === "agentSession.output") { clearTimeout(timeout); unsubscribe(); resolve(event); } });
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  events.emit("event", { type: "agentSession.output", data: { terminalId: "session-1" } });
  assert.equal((await received).data.terminalId, "session-1");
  await runtime.close();
});

test("read-only methods return safe empty or not-found results before runtime stores exist", async () => {
  const bridge = createBridge();

  assert.deepEqual((await bridge.handle(request(1, "skills.list"))).result, []);
  assert.deepEqual((await bridge.handle(request(2, "providers.list"))).result, []);
  assert.deepEqual((await bridge.handle(request(3, "runs.list"))).result, []);
  assert.equal((await bridge.handle(request(4, "runs.get", { runId: "missing" }))).result, null);
  assert.deepEqual((await bridge.handle(request(5, "artifacts.list"))).result, []);
  assert.equal((await bridge.handle(request(6, "artifacts.get", { artifactId: "missing" }))).result, null);
  assert.equal((await bridge.handle(request(7, "verification.get", { runId: "missing" }))).result, null);
  assert.deepEqual((await bridge.handle(request(8, "missions.list"))).result, []);
  assert.equal((await bridge.handle(request(9, "missions.get", { missionId: "missing" }))).result, null);
});

test("mission RPC methods remain additive and preserve the mission boundary", async () => {
  const bridge = createBridge({ services: { runtime: {
    listMissions: async () => [{ id: "mission-1", status: "draft" }],
    getMission: async (id) => ({ id }),
    createMission: async (params) => ({ id: "mission-1", objective: params.objective }),
    updateMission: async (id, patch) => ({ id, ...patch })
  } } });
  assert.deepEqual((await bridge.handle(request(1, "missions.list"))).result, [{ id: "mission-1", status: "draft" }]);
  assert.equal((await bridge.handle(request(2, "missions.create", { objective: "Criar cockpit" }))).result.objective, "Criar cockpit");
  assert.equal((await bridge.handle(request(3, "missions.update", { missionId: "mission-1", status: "running" }))).result.status, "running");
});

test("bridge delegates application reads to explicit service adapters", async () => {
  const bridge = createBridge({
    services: {
      skillRegistry: { list: async () => [{ id: "maestro/review" }] },
      providerRegistry: { list: async () => [{ id: "codex" }] },
      runStore: {
        listRuns: async () => [{ id: "run-1" }],
        getRun: async (id) => id === "run-1" ? { id } : undefined,
        listArtifacts: async () => [{ id: "artifact-1" }],
        getArtifact: async (id) => id === "artifact-1" ? { id } : undefined,
        getVerification: async (runId) => runId === "run-1" ? { id: "verification-1", runId } : undefined
      }
    }
  });

  assert.deepEqual((await bridge.handle(request(1, "skills.list"))).result, [{ id: "maestro/review" }]);
  assert.deepEqual((await bridge.handle(request(2, "providers.list"))).result, [{ id: "codex" }]);
  assert.deepEqual((await bridge.handle(request(3, "runs.get", { runId: "run-1" }))).result, { id: "run-1" });
  assert.deepEqual((await bridge.handle(request(4, "verification.get", { runId: "run-1" }))).result, { id: "verification-1", runId: "run-1" });
});

test("project manager methods stay behind the runtime service boundary", async () => {
  const bridge = createBridge({ services: { runtime: {
    listProjects: async () => [{ id: "project-1" }], getProject: async (id) => ({ id }),
    registerProject: async ({ projectPath }) => ({ id: "project-1", path: projectPath }),
    listTerminals: async () => [{ id: "terminal-1" }], getTerminal: async (id) => ({ id }),
    startTerminal: async () => ({ id: "terminal-1" }), stopTerminal: async () => true,
    sendTerminalInput: async () => true, inspectRun: async (id) => ({ run: { id } })
  } } });
  assert.deepEqual((await bridge.handle(request(1, "projects.list"))).result, [{ id: "project-1" }]);
  assert.equal((await bridge.handle(request(2, "projects.register", { projectPath: "/work/omega" }))).result.path, "/work/omega");
  assert.equal((await bridge.handle(request(3, "runs.inspect", { runId: "run-1" }))).result.run.id, "run-1");
  assert.equal((await bridge.handle(request(4, "terminals.input", { terminalId: "terminal-1", input: "status\\n" }))).result, true);
});

test("native terminal RPC methods are additive and preserve explicit backend errors", async () => {
  const bridge = createBridge({ services: { runtime: {
    listTerminalSessions: async () => [{ id: "session-1", backend: "tmux" }], getTerminalSession: async (id) => ({ id }),
    createTerminalSession: async () => ({ id: "session-1" }), attachTerminalSession: async () => true, closeTerminalSession: async () => true,
    registerTerminalClient: async () => ({ id: "session-1", status: "running" }), updateTerminalClientStatus: async () => ({ id: "session-1", status: "closed" }),
    terminalCapabilities: () => ({ backends: { tmux: false, vscode: true } })
  } } });
  assert.equal((await bridge.handle(request(1, "terminals.create", { kind: "shell" }))).result.id, "session-1");
  assert.equal((await bridge.handle(request(2, "terminals.attach", { terminalId: "session-1" }))).result, true);
  assert.equal((await bridge.handle(request(3, "terminals.capabilities"))).result.backends.vscode, true);
  const unavailable = createBridge({ services: { runtime: { createTerminalSession: async () => { const error = new Error("tmux ausente"); error.code = "TERMINAL_BACKEND_UNAVAILABLE"; error.backend = "tmux"; throw error; } } } });
  const response = await unavailable.handle(request(4, "terminals.create", {}));
  assert.equal(response.error.code, -32010);
  assert.deepEqual(response.error.data, { backend: "tmux" });
});

test("terminal input preserves whitespace and control characters required by interactive PTYs", async () => {
  const received = [];
  const bridge = createBridge({ services: { runtime: {
    getTerminalSession: async () => ({ id: "session-1", backend: "pty" }),
    inputTerminalSession: async (_id, input) => { received.push(input); return true; }
  } } });
  for (const input of [" ", "\r", "\t", "\u0003"]) {
    const response = await bridge.handle(request(1, "agentSessions.input", { terminalId: "session-1", input }));
    assert.equal(response.result, true);
  }
  assert.deepEqual(received, [" ", "\r", "\t", "\u0003"]);
});

test("project inspection is read-only and reports basic workspace facts", async () => {
  const bridge = createBridge({ projectRoot: process.cwd() });
  const response = await bridge.handle(request(1, "project.inspect"));

  assert.equal(response.result.exists, true);
  assert.equal(response.result.package.name, "@iapro/orquestrador-maestro-cli");
  assert.equal(response.result.git.detected, true);
});

test("JSON-RPC errors and notifications follow protocol behavior", async () => {
  const bridge = createBridge();

  const unknown = await bridge.handle(request("a", "does.not.exist"));
  assert.deepEqual(unknown.error, { code: -32601, message: "Method not found" });

  const missingId = await bridge.handle(request("b", "runs.cancel"));
  assert.equal(missingId.error.code, -32602);
  assert.match(missingId.error.message, /runId/u);

  const positionalParams = await bridge.handle(request("params", "runs.list", []));
  assert.equal(positionalParams.error.code, -32602);
  assert.match(positionalParams.error.message, /params/u);

  const incompatible = await bridge.handle(request("c", "initialize", { protocolVersion: 2 }));
  assert.equal(incompatible.error.code, -32602);
  assert.deepEqual(incompatible.error.data, { supportedProtocolVersions: [1] });

  const notification = await bridge.handle({ jsonrpc: "2.0", method: "skills.list" });
  assert.equal(notification, null);
});

test("stdio server uses newline-delimited JSON-RPC and recovers from parse errors", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.setEncoding("utf8");
  output.on("data", (chunk) => lines.push(...chunk.trim().split("\n").filter(Boolean)));
  const server = createStdioServer(createBridge(), { input, output });

  input.write("{bad json}\n");
  input.write(`${JSON.stringify(request(1, "providers.list"))}\n`);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(lines.map((line) => JSON.parse(line)), [
    { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
    { jsonrpc: "2.0", id: 1, result: [] }
  ]);
  server.close();
});
