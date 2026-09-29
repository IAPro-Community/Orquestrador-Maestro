"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { runtimePaths } = require("../runtime/bridge/socket-server");
const { SocketMaestroClient } = require("../runtime/client/socket-maestro-client");

function fixtureRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "maestro-daemon-closure-")); }
async function waitForRuntime(projectRoot) {
  const paths = runtimePaths(projectRoot);
  for (let attempt = 0; attempt < 250; attempt += 1) {
    if (fs.existsSync(paths.socketPath) && fs.existsSync(paths.tokenPath) && fs.existsSync(paths.pidPath)) return paths;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`runtime did not become ready: ${projectRoot}`);
}
async function startRuntime(projectRoot) {
  const cli = path.resolve(__dirname, "../bin/orquestrador-maestro.js");
  const child = require("node:child_process").spawn(process.execPath, [cli, "runtime", "--project-path", projectRoot], { stdio: "ignore", detached: true });
  child.unref();
  const paths = await waitForRuntime(projectRoot);
  const token = fs.readFileSync(paths.tokenPath, "utf8").trim();
  const client = new SocketMaestroClient({ socketPath: paths.socketPath, token, watchdog: false, requestTimeoutMs: 1_000 });
  await client.initialize();
  return { child, paths, pid: Number(fs.readFileSync(paths.pidPath, "utf8").trim()), client };
}
test("B1 socket client reset does not terminate the daemon", { skip: process.platform === "win32" }, async (t) => {
  const projectRoot = fixtureRoot();
  const cli = path.resolve(__dirname, "../bin/orquestrador-maestro.js");
  const child = require("node:child_process").spawn(process.execPath, [cli, "runtime", "--project-path", projectRoot], { stdio: "ignore", detached: true });
  child.unref();
  const paths = runtimePaths(projectRoot);
  let client;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (fs.existsSync(paths.socketPath) && fs.existsSync(paths.tokenPath)) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  client = new SocketMaestroClient({ socketPath: paths.socketPath, token: fs.readFileSync(paths.tokenPath, "utf8").trim(), watchdog: false, requestTimeoutMs: 1_000 });
  await client.initialize();
  client.close();
  const daemonPid = Number(fs.readFileSync(paths.pidPath, "utf8").trim());
  assert.doesNotThrow(() => process.kill(daemonPid, 0));
  const second = new SocketMaestroClient({ socketPath: paths.socketPath, token: fs.readFileSync(paths.tokenPath, "utf8").trim(), watchdog: false, requestTimeoutMs: 1_000 });
  await second.initialize();
  second.close();
  t.after(() => { try { process.kill(daemonPid, "SIGTERM"); } catch {} });
});

test("B1 explicit runtime stop removes only its live artifacts", { skip: process.platform === "win32" }, async () => {
  const projectRoot = fixtureRoot();
  const runtime = await startRuntime(projectRoot);
  runtime.client.close();
  process.kill(runtime.pid, "SIGTERM");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (![runtime.paths.pidPath, runtime.paths.socketPath, runtime.paths.tokenPath].some((file) => fs.existsSync(file))) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(runtime.paths.pidPath), false);
  assert.equal(fs.existsSync(runtime.paths.socketPath), false);
  assert.equal(fs.existsSync(runtime.paths.tokenPath), false);
});

test("B1 two clients share one daemon and either client may exit", { skip: process.platform === "win32" }, async (t) => {
  const projectRoot = fixtureRoot();
  const runtime = await startRuntime(projectRoot);
  const second = new SocketMaestroClient({ socketPath: runtime.paths.socketPath, token: fs.readFileSync(runtime.paths.tokenPath, "utf8").trim(), watchdog: false, requestTimeoutMs: 1_000 });
  await second.initialize();
  runtime.client.close();
  assert.equal((await second.health()).phase, "connected");
  second.close();
  assert.doesNotThrow(() => process.kill(runtime.pid, 0));
  t.after(() => { try { process.kill(runtime.pid, "SIGTERM"); } catch {} });
});
