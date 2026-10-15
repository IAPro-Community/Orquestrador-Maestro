"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SocketBridgeClient } = require("../runtime/bridge/socket-client");

async function fixture(t, handler) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-socket-client-"));
  const socketPath = process.platform === "win32"
    ? "\\\\.\\pipe\\maestro-client-test-" + process.pid + "-" + Date.now()
    : path.join(dir, "bridge.sock");
  const tokenPath = path.join(dir, "token");
  fs.writeFileSync(tokenPath, "test-token\n");
  const server = net.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  const client = new SocketBridgeClient({ timeoutMs: 70, maxBufferChars: 512 });
  client.paths = { socketPath, tokenPath };
  t.after(async () => {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return client;
}

test("RPC rejects when the daemon closes before responding", async (t) => {
  const client = await fixture(t, (socket) => socket.destroy());
  await assert.rejects(client.call("ping"), /encerrou a conexão|indisponível/);
});

test("RPC times out instead of hanging indefinitely", async (t) => {
  const client = await fixture(t, (socket) => {
    socket.resume();
    t.after(() => socket.destroy());
  });
  await assert.rejects(client.call("ping"), /tempo limite/);
});

test("RPC handles malformed JSON as a rejected promise", async (t) => {
  const client = await fixture(t, (socket) => {
    socket.once("data", () => socket.write('{"ok":true}\\nnot-json\\n'.replace(/\\n/g, "\n")));
  });
  await assert.rejects(client.call("ping"), /JSON inválido/);
});

test("RPC refuses an oversized unauthenticated response", async (t) => {
  const client = await fixture(t, (socket) => {
    socket.once("data", () => socket.write("A".repeat(2048)));
  });
  await assert.rejects(client.call("ping"), /limite permitido/);
});
