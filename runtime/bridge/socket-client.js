"use strict";

const fs = require("node:fs");
const net = require("node:net");
const { runtimePaths } = require("./socket-server");

class SocketBridgeClient {
  constructor({ projectRoot = process.cwd(), timeoutMs = 15000, maxBufferChars = 1048576 } = {}) {
    this.paths = runtimePaths(projectRoot);
    this.sequence = 0;
    this.timeoutMs = timeoutMs;
    this.maxBufferChars = maxBufferChars;
  }

  async call(method, params = {}) {
    const token = fs.readFileSync(this.paths.tokenPath, "utf8").trim();
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.paths.socketPath);
      const id = ++this.sequence;
      let buffer = "";
      let authenticated = false;
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(result);
      };
      const timer = setTimeout(() => finish(new Error("Runtime Maestro: tempo limite de resposta excedido.")), this.timeoutMs);
      socket.setEncoding("utf8");
      socket.on("error", (error) => finish(new Error("Runtime Maestro indisponível: " + error.message)));
      socket.on("close", () => {
        if (!settled) finish(new Error("Runtime Maestro encerrou a conexão antes de responder."));
      });
      socket.on("connect", () => socket.write(JSON.stringify({ token }) + "\n"));
      socket.on("data", (chunk) => {
        if (settled) return;
        buffer += chunk;
        if (buffer.length > this.maxBufferChars) {
          finish(new Error("Runtime Maestro: resposta excede o limite permitido."));
          return;
        }
        let newline;
        while (!settled && (newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          let message;
          try { message = JSON.parse(line); }
          catch { finish(new Error("Runtime Maestro retornou JSON inválido.")); return; }
          if (!authenticated) {
            if (!message?.ok) { finish(new Error("Autenticação do runtime Maestro falhou.")); return; }
            authenticated = true;
            socket.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
            continue;
          }
          if (message.id !== id) continue;
          if (message.error) {
            const description = typeof message.error === "object" ? message.error.message : String(message.error);
            finish(new Error(description || "Erro remoto desconhecido."));
          } else finish(null, message.result);
        }
      });
    });
  }

  subscribe(listener) {
    const token = fs.readFileSync(this.paths.tokenPath, "utf8").trim();
    const socket = net.createConnection(this.paths.socketPath);
    const requestId = ++this.sequence;
    let buffer = "";
    let authenticated = false;
    let closed = false;
    let notified = false;
    const disconnect = (message) => {
      if (closed || notified) return;
      notified = true;
      try { listener({ type: "runtime.disconnected", occurredAt: new Date().toISOString(), data: { message } }); } catch {}
    };
    const authTimer = setTimeout(() => {
      disconnect("Runtime Maestro: tempo limite de autenticação excedido.");
      socket.destroy();
    }, this.timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(JSON.stringify({ token }) + "\n"));
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > this.maxBufferChars) {
        disconnect("Runtime Maestro: evento excede o limite permitido.");
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); }
        catch { disconnect("Runtime Maestro enviou um evento inválido."); socket.destroy(); return; }
        if (!authenticated) {
          if (!message?.ok) { disconnect("Autenticação do runtime Maestro falhou."); socket.destroy(); return; }
          authenticated = true;
          clearTimeout(authTimer);
          socket.write(JSON.stringify({ jsonrpc: "2.0", id: requestId, method: "events.subscribe", params: {} }) + "\n");
          continue;
        }
        if (message.method === "maestro.event") {
          try { listener(message.params); } catch { /* listener exceptions must not kill the bridge */ }
        }
      }
    });
    socket.on("error", (error) => disconnect(error.message));
    socket.on("close", () => { clearTimeout(authTimer); disconnect("Runtime Maestro encerrou a assinatura."); });
    return () => { closed = true; clearTimeout(authTimer); socket.destroy(); };
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
