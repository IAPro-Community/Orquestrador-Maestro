"use strict";

const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { JsonFileRunStore } = require("../store/json-file-run-store");
const { runtimePaths } = require("../bridge/socket-server");
const { resolveProjectMaestroRoot } = require("../config/maestro-paths");

const RUNTIME_LIFECYCLE_CONTRACT = Object.freeze({
  states: Object.freeze(["stopped", "starting", "running", "stopping"]),
  transitions: Object.freeze({
    stopped: Object.freeze(["starting"]),
    starting: Object.freeze(["running", "stopping"]),
    running: Object.freeze(["stopping"]),
    stopping: Object.freeze(["stopped"])
  })
});

class RuntimeInstance {
  constructor({ projectRoot, mode = "in-process" }) {
    if (typeof projectRoot !== "string" || projectRoot.trim() === "") throw new TypeError("projectRoot must be a non-empty string");
    if (!['in-process', 'daemon'].includes(mode)) throw new TypeError("mode must be in-process or daemon");
    this.projectRoot = path.resolve(projectRoot);
    this.mode = mode;
    this.state = "stopped";
    this.startedAt = null;
  }

  transition(nextState) {
    if (!RUNTIME_LIFECYCLE_CONTRACT.transitions[this.state].includes(nextState)) {
      throw new Error(`Invalid runtime transition: ${this.state} -> ${nextState}`);
    }
    this.state = nextState;
    if (nextState === "running" && !this.startedAt) this.startedAt = new Date().toISOString();
    if (nextState === "stopped") this.startedAt = null;
    return this.state;
  }
}

function canConnect(socketPath, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    const done = (reachable) => { socket.destroy(); resolve(reachable); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function probeRuntimeHealth({ projectRoot, runFile, mode = "daemon", pid, startedAt } = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const resolvedRunFile = path.resolve(runFile || path.join(resolveProjectMaestroRoot(resolvedRoot), "runtime", "runs.json"));
  let storeHealthy = false;
  try {
    const store = new JsonFileRunStore({ filePath: resolvedRunFile });
    await store.initialize();
    storeHealthy = true;
  } catch {}
  const socketReachable = mode === "daemon" ? await canConnect(runtimePaths(resolvedRoot).socketPath) : false;
  const processAlive = mode === "in-process" || !pid ? true : (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();
  const status = storeHealthy && processAlive && (mode === "in-process" || socketReachable) ? "ok" : processAlive ? "degraded" : "stopped";
  return Object.freeze({
    status,
    pid: mode === "in-process" ? process.pid : pid,
    projectRoot: resolvedRoot,
    startedAt: startedAt || null,
    mode,
    storeHealthy,
    socketReachable
  });
}

function launchDaemonFixture({ projectRoot, runFile, heartbeat = true, timeoutMs = 5000 } = {}) {
  const fixturePath = path.resolve(__dirname, "../../tests/fixtures/r1-daemon-fixture.js");
  const child = spawn(process.execPath, [fixturePath, "--project-root", path.resolve(projectRoot), "--run-file", path.resolve(runFile), ...(heartbeat ? [] : ["--no-heartbeat"])], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`daemon fixture timed out: ${errors}`)); }, timeoutMs);
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.once("exit", (code, signal) => { clearTimeout(timer); reject(new Error(`daemon fixture exited before ready (${code ?? signal}): ${errors}`)); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      let ready;
      try { ready = JSON.parse(output.slice(0, newline)); } catch (error) { clearTimeout(timer); reject(error); return; }
      clearTimeout(timer);
      resolve({
        ...ready,
        child,
        async stop(signal = "SIGTERM") {
          if (child.exitCode !== null || child.signalCode !== null) return;
          await new Promise((done) => { child.once("exit", done); child.kill(signal); });
        }
      });
    });
  });
}

module.exports = {
  RUNTIME_LIFECYCLE_CONTRACT,
  RuntimeInstance,
  launchDaemonFixture,
  probeRuntimeHealth
};
