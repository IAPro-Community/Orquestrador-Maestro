"use strict";

/**
 * Failed-run accounting + diagnostic secret gates (PR18 ETAPA 1/2).
 *
 * - provider.execute() rejection and handle.result rejection both persist a
 *   failed run WITH minimal coherent cognitive telemetry (never invented
 *   tokens) and WITHOUT the raw secret in runs.json.
 * - failed reviewer stderr is sanitized before becoming summary/artifact.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MaestroApplication, ProviderRegistry } = require("../../application/maestro-application");
const { JsonFileRunStore } = require("../../store");
const { capabilities } = require("../../core");

const SECRET = "Bearer SUPER_SECRET_TOKEN_98127";
const API_KEY = "ghp_EXAMPLESECRET123";

class RejectExecuteAdapter {
  constructor() { this.id = "reject-probe"; }
  async detect() { return { id: this.id, installed: true, executable: "probe" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute() { throw new Error(`transport exploded: ${SECRET} at postgres://u:p@h/db`); }
}

class RejectResultAdapter {
  constructor() { this.id = "reject-result-probe"; }
  async detect() { return { id: this.id, installed: true, executable: "probe" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  async execute() {
    return { pid: 1, cancel() {}, result: Promise.reject(new Error(`result failed: ${API_KEY} cookie: s=deadbeef`)) };
  }
}

function fixture(adapter) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-failed-run-"));
  const filePath = path.join(root, "runs.json");
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath }),
    providers: new ProviderRegistry([adapter]),
    skills: { get: () => null }
  });
  return { app, filePath };
}

test("provider.execute() rejection keeps failed telemetry and drops secrets", async () => {
  const { app, filePath } = fixture(new RejectExecuteAdapter());
  const outcome = await app.executeRun({ description: "execute rejects", providerId: "reject-probe", verificationCommands: [] });
  assert.equal(outcome.run.status, "failed");
  const telemetry = outcome.run.metadata.cognitiveTelemetry;
  assert.ok(telemetry, "failed run must carry cognitive telemetry");
  assert.equal(telemetry.status, "failed");
  assert.equal(telemetry.outcome, "failed");
  assert.equal(telemetry.tool, "reject-probe");
  assert.equal(telemetry.tokenInput, null);
  assert.equal(telemetry.tokenOutput, null);
  assert.equal(telemetry.cachedInputTokens, null);
  assert.equal(telemetry.tokenSource, "unavailable");
  assert.equal(telemetry.usageScope, "unknown");
  assert.equal(telemetry.reviewCalls, 0);
  assert.equal(telemetry.primaryCalls, 1);
  assert.ok(telemetry.traceId);
  assert.ok(telemetry.spanId);
  assert.ok(Number.isFinite(telemetry.durationMs));
  const content = fs.readFileSync(filePath, "utf8");
  assert.equal(content.includes("SUPER_SECRET_TOKEN_98127"), false, "bearer must not persist");
  assert.equal(content.includes("postgres://u:p@h"), false, "connection credentials must not persist");
});

test("handle.result rejection keeps failed telemetry and drops secrets", async () => {
  const { app, filePath } = fixture(new RejectResultAdapter());
  const outcome = await app.executeRun({ description: "result rejects", providerId: "reject-result-probe", verificationCommands: [] });
  assert.equal(outcome.run.status, "failed");
  const telemetry = outcome.run.metadata.cognitiveTelemetry;
  assert.ok(telemetry, "failed run must carry cognitive telemetry");
  assert.equal(telemetry.status, "failed");
  assert.equal(telemetry.primaryCalls, 1);
  assert.equal(telemetry.tokenSource, "unavailable");
  const content = fs.readFileSync(filePath, "utf8");
  assert.equal(content.includes("ghp_EXAMPLESECRET123"), false, "api key must not persist");
  assert.equal(content.includes("deadbeef"), false, "cookie must not persist");
});

test("failed reviewer stderr is sanitized before durable summary", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-failed-reviewer-"));
  const { execFileSync } = require("node:child_process");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "test"], { cwd: root });
  fs.writeFileSync(path.join(root, "tracked.js"), "module.exports = 1;\n");
  execFileSync("git", ["add", "tracked.js"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  fs.writeFileSync(path.join(root, "tracked.js"), "module.exports = 2;\n");
  class ReviewFailAdapter {
    constructor() { this.id = "review-fail-probe"; this.calls = 0; }
    async detect() { return { id: this.id, installed: true, executable: "probe" }; }
    async capabilities() { return capabilities({ headless: true, streaming: true }); }
    supportsReadOnlyReview() { return true; }
    async execute() {
      this.calls += 1;
      if (this.calls > 1) {
        return { pid: 1, cancel() {}, result: Promise.resolve({ providerId: this.id, pid: 1, exitCode: 3, stdout: "", stderr: `reviewer blew up: ${SECRET}`, durationMs: 1 }) };
      }
      return { pid: 1, cancel() {}, result: Promise.resolve({ providerId: this.id, pid: 1, exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 }) };
    }
  }
  const filePath = path.join(root, "runs.json");
  const app = new MaestroApplication({
    projectRoot: root,
    governance: { features: { independentReview: true } },
    store: new JsonFileRunStore({ filePath }),
    providers: new ProviderRegistry([new ReviewFailAdapter()]),
    skills: { get: () => null }
  });
  const outcome = await app.executeRun({
    description: "Alterar autenticação",
    providerId: "review-fail-probe",
    semanticTask: { id: "auth", objective: "Alterar autenticação", risk: "high", complexity: "complex", changeClass: "security-compliance", acceptanceCriteria: ["tests pass"] },
    verificationCommands: [{ name: "ok", command: `${process.execPath} -e "process.exit(0)"` }]
  });
  assert.equal(outcome.review.status, "inconclusive");
  const content = fs.readFileSync(filePath, "utf8");
  assert.equal(content.includes("SUPER_SECRET_TOKEN_98127"), false, "reviewer stderr secret must not persist");
});
