"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { capabilities } = require("../../core");
const { MaestroApplication, ProviderRegistry } = require("../maestro-application");
const { JsonFileRunStore } = require("../../store");

class FakeAdapter {
  constructor() { this.id = "fake"; this.calls = 0; }
  async detect() { return { id: this.id, installed: true, executable: "fake" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute() {
    this.calls++;
    return {
      pid: 1, cancel() {},
      result: Promise.resolve({
        providerId: this.id, pid: 1, exitCode: 0, stdout: "ok",
        stderr: "", durationMs: 1, cancelled: false, timedOut: false
      })
    };
  }
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-prepared-run-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const provider = new FakeAdapter();
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });
  return { app, provider };
}

test("prepared Run is persisted and provider effects begin only on one-shot execution", async (t) => {
  const { app, provider } = fixture(t);
  const request = { providerId: "fake", description: "Improve documentation", verificationCommands: [] };
  const prepared = await app.createRun(request);
  assert.equal(provider.calls, 0);
  assert.equal((await app.getRun(prepared.run.id)).status, "pending");
  assert.equal(Object.isFrozen(prepared), true);
  const result = await app.executePreparedRun(prepared, request);
  assert.equal(result.run.id, prepared.run.id);
  assert.equal(result.run.status, "completed");
  assert.equal(provider.calls, 1);
  assert.equal((await app.listRuns()).length, 1, "no duplicate Run ID on resumed prepared execution");
  await assert.rejects(app.executePreparedRun(prepared, request), { code: "PREPARED_RUN_NOT_OWNED" });
  assert.equal(provider.calls, 1);
});

test("forged prepared handle cannot dispatch and cannot be replayed from another instance", async (t) => {
  const { app, provider } = fixture(t);
  const request = { providerId: "fake", description: "Verify API behavior", verificationCommands: [] };
  const prepared = await app.createRun(request);
  await assert.rejects(app.executePreparedRun({ ...prepared }, request), { code: "PREPARED_RUN_NOT_OWNED" });
  await assert.rejects(new MaestroApplication({ projectRoot: app.projectRoot }).executePreparedRun(prepared, request), {
    code: "PREPARED_RUN_NOT_OWNED"
  });
  assert.equal(provider.calls, 0);
  const result = await app.executePreparedRun(prepared, request);
  assert.equal(result.run.status, "completed");
  assert.equal(provider.calls, 1);
});

test("changed persisted Run state and changed request both fail before provider dispatch", async (t) => {
  const { app, provider } = fixture(t);
  const request = { providerId: "fake", description: "Write a safe README", verificationCommands: [] };
  const prepared = await app.createRun(request);
  await assert.rejects(app.executePreparedRun(prepared, {
    ...request, description: "Different instructions"
  }), { code: "PREPARED_RUN_STATE_MISMATCH" });
  assert.equal(provider.calls, 0);
  await assert.rejects(app.executePreparedRun(prepared, request), { code: "PREPARED_RUN_NOT_OWNED" });

  const next = await app.createRun(request);
  await app.store.saveRun({ ...next.run, status: "cancelled" });
  await assert.rejects(app.executePreparedRun(next, request), { code: "PREPARED_RUN_STATE_MISMATCH" });
  assert.equal(provider.calls, 0);
});

test("legacy executeRun CLI path still creates and executes exactly one persisted Run", async (t) => {
  const { app, provider } = fixture(t);
  const result = await app.executeRun({ providerId: "fake", description: "Check log formatting", verificationCommands: [] });
  assert.equal(result.run.status, "completed");
  assert.equal(provider.calls, 1);
  assert.equal((await app.listRuns()).length, 1);
});

test("fenced abort signal cancels the active provider handle without duplicate dispatch", async (t) => {
  const { app, provider } = fixture(t);
  const request = {
    providerId: "fake", description: "Check cancellation of a supervised provider",
    verificationCommands: []
  };
  let notifyStarted;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  let settle;
  let cancelCalls = 0;
  provider.execute = async () => {
    provider.calls++;
    const result = new Promise((resolve) => { settle = resolve; });
    notifyStarted();
    return {
      pid: 1,
      cancel() {
        cancelCalls++;
        settle({
          providerId: provider.id, pid: 1, exitCode: 130,
          stdout: "", stderr: "", durationMs: 1,
          cancelled: true, timedOut: false
        });
      },
      result
    };
  };
  const prepared = await app.createRun(request);
  const controller = new AbortController();
  const execution = app.executePreparedRun(prepared, request, { signal: controller.signal });
  await started;
  controller.abort();
  controller.abort();
  const completed = await execution;
  assert.equal(provider.calls, 1, "one prepared Run must dispatch once");
  assert.equal(cancelCalls, 1, "cancellation must reach the provider exactly once");
  assert.equal(completed.run.status, "cancelled");
  assert.equal((await app.getRun(prepared.run.id)).status, "cancelled");
});


test("abort during asynchronous provider startup is not lost before handle attachment", async (t) => {
  const { app, provider } = fixture(t);
  const request = {
    providerId: "fake", description: "Validate cancellation during provider startup",
    verificationCommands: []
  };
  let notifyStarting, releaseStart, settle;
  const starting = new Promise((resolve) => { notifyStarting = resolve; });
  const startGate = new Promise((resolve) => { releaseStart = resolve; });
  let cancelled = 0;
  provider.execute = async () => {
    provider.calls++;
    notifyStarting();
    await startGate;
    return {
      pid: 1,
      cancel() {
        cancelled++;
        settle({
          providerId: provider.id, pid: 1, exitCode: 130,
          stdout: "", stderr: "", durationMs: 1,
          cancelled: true, timedOut: false
        });
      },
      result: new Promise((resolve) => { settle = resolve; })
    };
  };
  const prepared = await app.createRun(request);
  const controller = new AbortController();
  const running = app.executePreparedRun(prepared, request, { signal: controller.signal });
  await starting;
  controller.abort();
  releaseStart();
  const result = await running;
  assert.equal(provider.calls, 1);
  assert.equal(cancelled, 1, "abort during provider startup must cancel the eventual handle");
  assert.equal(result.run.status, "cancelled");
});
