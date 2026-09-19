"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { JsonFileRunStore } = require("../../store");
const { MaestroApplication, ProviderRegistry } = require("../../application/maestro-application");
const { capabilities } = require("../../core");

class UsageAdapter {
  constructor(stdout) {
    this.id = "codex";
    this.stdout = stdout;
    this.prompts = [];
  }
  async detect() { return { id: this.id, installed: true, executable: "fake" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  supportsReadOnlyReview() { return true; }
  async execute(request) {
    this.prompts.push(request.prompt);
    const isReview = this.prompts.length > 1;
    const stdout = isReview
      ? JSON.stringify({ verdict: "approved", findings: [], summary: "ok" })
      : this.stdout;
    return { pid: 1, cancel() {}, result: Promise.resolve({ providerId: this.id, pid: 1, exitCode: 0, stdout, stderr: "", durationMs: 5, cancelled: false, timedOut: false }) };
  }
}

function codexStdout() {
  return [
    JSON.stringify({ type: "thread.started", thread_id: "thread-9" }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 500, cached_input_tokens: 100, output_tokens: 120 } })
  ].join("\n");
}

test("provider-reported usage flows into cognitive telemetry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-telemetry-reported-"));
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new UsageAdapter(codexStdout())]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({ description: "Telemetry check", providerId: "codex", verificationCommands: [] });
  const telemetry = outcome.run.metadata.cognitiveTelemetry;
  assert.equal(telemetry.tool, "codex");
  assert.equal(telemetry.tokenInput, 500);
  assert.equal(telemetry.tokenOutput, 120);
  assert.equal(telemetry.cachedInputTokens, 100);
  assert.equal(telemetry.tokenSource, "provider-reported");
  assert.equal(telemetry.sessionId, "thread-9");
  assert.ok(telemetry.runId);
  assert.ok(telemetry.traceId);
});

test("provider without usage stays unavailable, never zero", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-telemetry-missing-"));
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new UsageAdapter("plain output")]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({ description: "No usage", providerId: "codex", verificationCommands: [] });
  const telemetry = outcome.run.metadata.cognitiveTelemetry;
  assert.equal(telemetry.tokenInput, null);
  assert.equal(telemetry.tokenSource, "unavailable");
  assert.notEqual(telemetry.tokenInput, 0);
});

test("old RunStore files without telemetry stay readable", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-telemetry-compat-"));
  const filePath = path.join(root, "runs.json");
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, projects: [], missions: [], tasks: [], runs: [{ id: "run-old", taskId: "task-old", status: "completed" }], steps: [], executions: [], events: [], artifacts: [], verifications: [], terminals: [], projectSnapshots: [], intentSessions: [], missionBriefs: [], taskGraphs: [], attention: [] }));
  const store = new JsonFileRunStore({ filePath });
  await store.initialize();
  assert.equal((await store.getRun("run-old")).status, "completed");
});

test("telemetry never persists prompt or completion content", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-telemetry-privacy-"));
  const sentinel = "SYNTHETIC_VALUE_12345";
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new UsageAdapter("plain")]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({ description: `Handle ${sentinel}`, providerId: "codex", verificationCommands: [] });
  const serialized = JSON.stringify(outcome.run.metadata.cognitiveTelemetry);
  assert.doesNotMatch(serialized, /SYNTHETIC_VALUE_12345/u);
  assert.equal(outcome.run.metadata.cognitiveTelemetry.promptHash === null || typeof outcome.run.metadata.cognitiveTelemetry.promptHash === "string", true);
});

test("blocked and failed runs carry explicit telemetry status", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-telemetry-blocked-"));
  const { execFileSync } = require("node:child_process");
  class Fake {
    constructor() { this.id = "fake"; }
    async detect() { return { id: this.id, installed: true }; }
    async capabilities() { return capabilities({ headless: true, streaming: true }); }
  }
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([new Fake()]),
    skills: { get: () => null }
  });
  const blocked = await app.executeRun({ providerId: "fake", description: "critical change", semanticTask: { risk: "critical", complexity: "complex" }, verificationCommands: [] });
  assert.equal(blocked.run.status, "blocked");
  assert.equal(blocked.run.metadata.cognitiveTelemetry.outcome, "blocked");
  assert.equal(blocked.run.metadata.cognitiveTelemetry.tokenSource, "unavailable");
  void execFileSync;
});
