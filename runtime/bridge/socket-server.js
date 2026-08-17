"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

function runtimePaths(projectRoot) {
  const key = crypto.createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16);
  const base = path.join(os.tmpdir(), "maestro-runtime");
  return process.platform === "win32"
    ? { socketPath: `\\\\.\\pipe\\maestro-${key}`, tokenPath: path.join(base, `${key}.token`) }
    : { socketPath: path.join(base, `${key}.sock`), tokenPath: path.join(base, `${key}.token`) };
}

function startSocketRuntime(bridge, { projectRoot = process.cwd() } = {}) {
  const paths = runtimePaths(projectRoot);
  fs.mkdirSync(path.dirname(paths.tokenPath), { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") { try { fs.unlinkSync(paths.socketPath); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(paths.tokenPath, `${token}\n`, { mode: 0o600 });
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8"); let pending = ""; let authenticated = false; let unsubscribe;
    socket.on("close", () => { unsubscribe?.(); unsubscribe = undefined; });
    socket.on("data", async (chunk) => {
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (!authenticated) { authenticated = message?.token === token; socket.write(`${JSON.stringify(authenticated ? { ok: true } : { ok: false, error: "unauthorized" })}\n`); if (!authenticated) socket.destroy(); continue; }
          if (message?.method === "events.subscribe" && !unsubscribe && typeof bridge.subscribe === "function") {
            unsubscribe = bridge.subscribe((event) => {
              if (!socket.destroyed) socket.write(`${JSON.stringify({ jsonrpc: "2.0", method: "maestro.event", params: event })}\n`);
            });
          }
          const response = await bridge.handle(message); if (response) socket.write(`${JSON.stringify(response)}\n`);
        } catch { socket.write('{"error":"invalid_request"}\n'); }
      }
    });
  });
  server.listen(paths.socketPath);
  return { server, paths, close: () => new Promise((resolve) => server.close(() => {
    try { fs.unlinkSync(paths.tokenPath); } catch {}
    if (process.platform !== "win32") { try { fs.unlinkSync(paths.socketPath); } catch {} }
    resolve();
  })) };
}

module.exports = { runtimePaths, startSocketRuntime };
