"use strict";

const fs = require("node:fs");
const net = require("node:net");
const { runtimePaths } = require("./socket-server");

class SocketBridgeClient {
  constructor({ projectRoot = process.cwd() } = {}) { this.paths = runtimePaths(projectRoot); this.sequence = 0; }
  async call(method, params = {}) {
    const token = fs.readFileSync(this.paths.tokenPath, "utf8").trim();
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.paths.socketPath); let buffer = ""; let authenticated = false;
      socket.setEncoding("utf8");
      socket.once("error", (error) => reject(new Error(`Runtime Maestro indisponível: ${error.message}`)));
      socket.on("connect", () => socket.write(`${JSON.stringify({ token })}\n`));
      socket.on("data", (chunk) => {
        buffer += chunk; let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); const message = JSON.parse(line);
          if (!authenticated) { if (!message.ok) { socket.destroy(); reject(new Error("Autenticação do runtime Maestro falhou.")); return; } authenticated = true; socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: ++this.sequence, method, params })}\n`); continue; }
          socket.end(); if (message.error) reject(Object.assign(new Error(message.error.message), message.error)); else resolve(message.result);
        }
      });
    });
  }
  subscribe(listener) {
    const token = fs.readFileSync(this.paths.tokenPath, "utf8").trim();
    const socket = net.createConnection(this.paths.socketPath); let buffer = ""; let authenticated = false; const requestId = ++this.sequence;
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(`${JSON.stringify({ token })}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk; let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); const message = JSON.parse(line);
        if (!authenticated) { authenticated = Boolean(message.ok); if (authenticated) socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "events.subscribe", params: {} })}\n`); continue; }
        if (message.method === "maestro.event") listener(message.params);
      }
    });
    socket.on("error", (error) => listener({ type: "runtime.disconnected", occurredAt: new Date().toISOString(), data: { message: error.message } }));
    return () => socket.destroy();
  }
}

function createRuntimeApplicationClient(projectRoot) {
  const client = new SocketBridgeClient({ projectRoot });
  return {
    projectRoot,
    initialize: async () => client.call("initialize", { protocolVersion: 1 }),
    inspectProject: (params) => client.call("project.inspect", params),
    listProjects: () => client.call("projects.list"),
    listProviders: () => client.call("providers.list"),
    listMissions: (params) => client.call("missions.list", params),
    createMission: (params) => client.call("missions.create", params),
    updateMission: (missionId, patch) => client.call("missions.update", { missionId, ...patch }),
    listTerminalSessions: (params) => client.call("terminals.list", params),
    createTerminalSession: (params) => client.call("agentSessions.create", params),
    closeTerminalSession: (terminalId) => client.call("agentSessions.close", { terminalId }),
    attachTerminalSession: (terminalId) => client.call("terminals.attach", { terminalId }),
    focusTerminalSession: (terminalId) => client.call("agentSessions.focus", { terminalId }),
    inputTerminalSession: (terminalId, input) => client.call("agentSessions.input", { terminalId, input }),
    resizeTerminalSession: (terminalId, columns, rows) => client.call("agentSessions.resize", { terminalId, columns, rows }),
    snapshotTerminalSession: (terminalId, afterSequence = 0) => client.call("agentSessions.snapshot", { terminalId, afterSequence }),
    subscribe: (listener) => client.subscribe(listener)
  };
}

module.exports = { SocketBridgeClient, createRuntimeApplicationClient };
