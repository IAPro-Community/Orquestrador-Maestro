"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { runtimePaths } = require("../runtime/bridge/socket-server");
const { SocketMaestroClient } = require("../runtime/client/socket-maestro-client");

function fixtureRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "maestro-daemon-closure-")); }
let nodePty = null;
if (process.platform === "darwin") {
  try { nodePty = require("node-pty"); } catch {}
}
const realPtySkip = process.platform === "win32"
  ? "real PTY daemon lifecycle tests are Unix-only"
  : process.platform === "darwin" && !nodePty
    ? "node-pty optional dependency is unavailable"
    : false;

async function runImmediateTui(projectRoot) {
  const cli = path.resolve(__dirname, "../bin/orquestrador-maestro.js");
  if (process.platform === "darwin") {
    const child = nodePty.spawn(process.execPath, [cli, "tui", "--project-path", projectRoot], {
      cols: 80,
      rows: 24,
      cwd: projectRoot,
      env: { ...process.env, TERM: "xterm-256color" }
    });
    let output = "";
    child.onData(data => { output += data; });
    const exited = new Promise(resolve => child.onExit(resolve));
    await new Promise(resolve => setTimeout(resolve, 100));
    child.write("q\r");
    let timer;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(() => {
        child.kill();
        reject(new Error("TUI did not exit within 10 seconds"));
      }, 10_000);
    });
    try {
      const result = await Promise.race([exited, timedOut]);
      return { status: result.exitCode, signal: result.signal || null, stderr: output };
    } finally {
      clearTimeout(timer);
    }
  }

  const command = `${process.execPath} ${JSON.stringify(cli)} tui --project-path ${JSON.stringify(projectRoot)}`;
  return spawnSync("script", ["-qefc", command, "/dev/null"], {
    input: "q\n", encoding: "utf8", timeout: 10_000,
    env: { ...process.env, TERM: "xterm-256color" }
  });
}
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
async function assertDaemonAlive(projectRoot) {
  const paths = runtimePaths(projectRoot);
  assert.equal(fs.existsSync(paths.pidPath), true, "daemon PID file must exist");
  assert.equal(fs.existsSync(paths.socketPath), true, "daemon socket must exist");
  assert.equal(fs.existsSync(paths.tokenPath), true, "daemon token must exist");
  const pid = Number(fs.readFileSync(paths.pidPath, "utf8").trim());
  assert.doesNotThrow(() => process.kill(pid, 0), "daemon process must survive TUI exit");
  const client = new SocketMaestroClient({ socketPath: paths.socketPath, token: fs.readFileSync(paths.tokenPath, "utf8").trim(), watchdog: false, requestTimeoutMs: 1_000 });
  await client.initialize();
  assert.equal((await client.health()).phase, "connected");
  client.close();
  return { paths, pid };
}

test("B1 cold boot then immediate real-PTY TUI exit preserves the independent daemon", { skip: realPtySkip }, async (t) => {
  const projectRoot = fixtureRoot();
  const result = await runImmediateTui(projectRoot);
  const exited = result.status === 0 || result.signal != null;
  assert.ok(exited, `expected exit or signal, got status=${result.status} signal=${result.signal} stderr=${result.stderr || ""}`);
  const daemon = await assertDaemonAlive(projectRoot);
  t.after(() => { try { process.kill(daemon.pid, "SIGTERM"); } catch {} });
});

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

test("B1 stale dead runtime artifacts are recoverable", { skip: realPtySkip }, async (t) => {
  const projectRoot = fixtureRoot();
  const paths = runtimePaths(projectRoot);
  fs.mkdirSync(path.dirname(paths.pidPath), { recursive: true });
  fs.writeFileSync(paths.pidPath, "999999\n");
  fs.writeFileSync(paths.tokenPath, "stale\n");
  fs.writeFileSync(paths.socketPath, "stale");
  const result = await runImmediateTui(projectRoot);
  const exited = result.status === 0 || result.signal != null;
  assert.ok(exited, `expected exit or signal, got status=${result.status} signal=${result.signal} stderr=${result.stderr || ""}`);
  const daemon = await assertDaemonAlive(projectRoot);
  t.after(() => { try { process.kill(daemon.pid, "SIGTERM"); } catch {} });
});

test("B1 rapid immediate open/close keeps every daemon alive", { skip: realPtySkip }, async (t) => {
  const daemons = [];
  for (let index = 0; index < 10; index += 1) {
    const projectRoot = fixtureRoot();
    const result = await runImmediateTui(projectRoot);
    const exited = result.status === 0 || result.signal != null;
    assert.ok(exited, `iteration ${index}: expected exit or signal, got status=${result.status} signal=${result.signal} stderr=${result.stderr || ""}`);
    daemons.push(await assertDaemonAlive(projectRoot));
  }
  t.after(() => { for (const daemon of daemons) { try { process.kill(daemon.pid, "SIGTERM"); } catch {} } });
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
