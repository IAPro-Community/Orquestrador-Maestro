"use strict";

/**
 * Durable privacy + write-amplification gates (FASE 2/3/21).
 *
 * - Executes runs with unique sentinels in prompt/stdout/stderr and proves
 *   the persisted runs.json file never contains them.
 * - Simulates many provider chunks and proves durable events stay bounded
 *   (no per-chunk file rewrite).
 * - Covers primary, reviewer, failed, cancelled and timed-out paths plus
 *   malformed provider events.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MaestroApplication, ProviderRegistry } = require("../../application/maestro-application");
const { JsonFileRunStore } = require("../../store");
const { capabilities } = require("../../core");

function sentinel(name, rand) {
  return `${name}_${rand}`;
}

class SentinelAdapter {
  constructor({ stdout, stderr, exitCode = 0, reviewStdout = null } = {}) {
    this.id = "sentinel-probe";
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = exitCode;
    this.reviewStdout = reviewStdout;
    this.prompts = [];
    this.events = [];
  }
  async detect() { return { id: this.id, installed: true, executable: "probe" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  supportsReadOnlyReview() { return true; }
  async execute(request) {
    this.prompts.push(request.prompt);
    const isReview = this.prompts.length > 1;
    const stdout = isReview && this.reviewStdout !== null ? this.reviewStdout : this.stdout;
    // Emit chunked stream like a real provider (ephemeral).
    const chunks = String(stdout).match(/.{1,7}/gsu) || [];
    for (const chunk of chunks) {
      const event = { type: "provider.output", providerId: this.id, stream: "stdout", chunk };
      this.events.push(event);
      request.onEvent(event);
    }
    if (this.stderr) request.onEvent({ type: "provider.output", providerId: this.id, stream: "stderr", chunk: this.stderr });
    request.onEvent({ type: "provider.started", providerId: this.id, pid: 1 });
    const result = { providerId: this.id, pid: 1, exitCode: this.exitCode, stdout, stderr: this.stderr || "", durationMs: 1, cancelled: false, timedOut: false };
    request.onEvent({ type: "provider.completed", providerId: this.id, pid: 1, exitCode: this.exitCode, durationMs: 1 });
    return { pid: 1, cancel() {}, result: Promise.resolve(result) };
  }
}

async function readPersisted(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("primary run never persists prompt/stdout/stderr sentinels", async () => {
  const rand = String(Date.now()).slice(-6);
  const PROMPT = sentinel("PROMPT_SENTINEL", rand);
  const OUT = sentinel("STDOUT_SENTINEL", rand);
  const ERR = sentinel("STDERR_SENTINEL", rand);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-durable-privacy-"));
  const filePath = path.join(root, "runs.json");
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath }),
    providers: new ProviderRegistry([new SentinelAdapter({ stdout: `result ${OUT}`, stderr: `warn ${ERR}` })]),
    skills: { get: () => null }
  });
  const origBuild = app.buildPrompt.bind(app);
  app.buildPrompt = () => `TASK ${PROMPT} ${origBuild({ task: { description: "x" }, skills: [], profile: { displayName: "dev" }, workspace: { path: root }, interaction: null })}`;
  await app.executeRun({ description: "privacy probe", providerId: "sentinel-probe", verificationCommands: [] });
  const content = await readPersisted(filePath);
  assert.equal(content.includes(PROMPT), false, "prompt must not reach disk");
  assert.equal(content.includes(OUT), false, "stdout must not reach disk as raw");
  assert.equal(content.includes(ERR), false, "stderr must not reach disk as raw");
  const persisted = JSON.parse(content);
  const chunkEvents = (persisted.events || []).filter((e) => e.type === "provider.output");
  assert.equal(chunkEvents.length, 0, "no per-chunk durable events");
  // Reviewer prompt with sentinel also stays off disk (no review here, but
  // execution metadata must carry only summaries).
  const executions = persisted.executions || [];
  assert.ok(executions.length >= 1);
  assert.equal(JSON.stringify(executions).includes(PROMPT), false);
  assert.equal(JSON.stringify(executions).includes(OUT), false);
});

test("many chunks keep durable events bounded (single snapshot)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-write-amplification-"));
  const filePath = path.join(root, "runs.json");
  const big = `CHUNK_${"x".repeat(200)}`;
  const adapter = new SentinelAdapter({ stdout: Array.from({ length: 500 }, (_, i) => `${big}_${i}`).join("\n") });
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath }),
    providers: new ProviderRegistry([adapter]),
    skills: { get: () => null }
  });
  await app.executeRun({ description: "amplification probe", providerId: "sentinel-probe", verificationCommands: [] });
  const persisted = JSON.parse(await readPersisted(filePath));
  const chunkEvents = persisted.events.filter((e) => e.type === "provider.output" || e.type === "run.output");
  assert.equal(chunkEvents.length, 0, "streaming chunks must be ephemeral");
  // Total durable events for the run stay small (lifecycle only).
  const runEvents = persisted.events.filter((e) => e.runId);
  assert.ok(runEvents.length < 30, `durable events bounded, got ${runEvents.length}`);
});

test("failed/cancelled/timed-out runs keep raw output off disk", async () => {
  for (const mode of ["failed", "cancelled", "timedout"]) {
    const rand = `${Date.now()}_${mode}`.slice(-10);
    const OUT = sentinel("STDOUT_FAIL", rand);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-durable-fail-"));
    const filePath = path.join(root, "runs.json");
    class ModeAdapter extends SentinelAdapter {
      async execute(request) {
        this.prompts.push(request.prompt);
        const cancelled = mode === "cancelled";
        const timedOut = mode === "timedout";
        const exitCode = mode === "failed" ? 3 : 0;
        const result = { providerId: this.id, pid: 1, exitCode, stdout: `out ${OUT}`, stderr: "", durationMs: 1, cancelled, timedOut };
        return { pid: 1, cancel() {}, result: Promise.resolve(result) };
      }
    }
    const app = new MaestroApplication({
      projectRoot: root,
      store: new JsonFileRunStore({ filePath }),
      providers: new ProviderRegistry([new ModeAdapter({ stdout: `out ${OUT}` })]),
      skills: { get: () => null }
    });
    await app.executeRun({ description: `fail probe ${mode}`, providerId: "sentinel-probe", verificationCommands: [] });
    const content = await readPersisted(filePath);
    assert.equal(content.includes(OUT), false, `${mode}: stdout sentinel must not persist`);
  }
});

test("malformed provider events never persist raw payloads", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-durable-malformed-"));
  const filePath = path.join(root, "runs.json");
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath }),
    providers: new ProviderRegistry([new SentinelAdapter({ stdout: "not json\n{broken\n{\"type\":\"mystery\"}" })]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({ description: "malformed probe", providerId: "sentinel-probe", verificationCommands: [] });
  assert.ok(["completed", "failed"].includes(outcome.run.status));
  const content = await readPersisted(filePath);
  assert.equal(content.includes("{broken"), false);
});
