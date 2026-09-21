"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { JsonFileRunStore } = require("../../store");
const { MaestroApplication, ProviderRegistry } = require("../../application/maestro-application");
const { capabilities } = require("../../core");

class UsageAdapter {
  constructor() {
    this.id = "codex";
    this.prompts = [];
  }

  async detect() { return { id: this.id, installed: true, executable: "fake" }; }
  async capabilities() { return capabilities({ headless: true, streaming: true }); }
  supportsReadOnlyReview() { return true; }

  async execute(request) {
    this.prompts.push(request.prompt);
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-resolution" }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 500, cached_input_tokens: 100, output_tokens: 120 } })
    ].join("\n");
    return {
      pid: 1,
      cancel() {},
      result: Promise.resolve({ providerId: this.id, pid: 1, exitCode: 0, stdout, stderr: "", durationMs: 5, cancelled: false, timedOut: false })
    };
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

test("adaptive resolution observes a real run without changing execution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-adaptive-resolution-"));
  const provider = new UsageAdapter();
  const app = new MaestroApplication({
    projectRoot: root,
    store: new JsonFileRunStore({ filePath: path.join(root, "runs.json") }),
    providers: new ProviderRegistry([provider]),
    skills: { get: () => null }
  });

  const outcome = await app.executeRun({
    description: "Fix a small local regression",
    providerId: "codex",
    semanticTask: { id: "resolution-1", objective: "Fix a small local regression", risk: "low", complexity: "simple", changeClass: "local", acceptanceCriteria: [] },
    evidenceCandidates: [
      { id: "failure", kind: "error", contentHash: sha256("Fix a small local regression"), required: true, estimatedTokens: 120, relevance: 1, reliability: 1, freshness: 1, failureRelation: 1, dependencyProximity: 0.8 },
      { id: "source", kind: "source-file", contentHash: "a".repeat(64), estimatedTokens: 700, relevance: 0.95, reliability: 0.9, freshness: 0.9, failureRelation: 0.9, dependencyProximity: 1 }
    ],
    verificationCommands: [{ name: "ok", command: `${process.execPath} -e "process.exit(0)"` }]
  });

  assert.equal(provider.prompts.length, 1);
  assert.equal(outcome.run.status, "completed");
  assert.equal(outcome.run.metadata.adaptiveResolution.mode, "shadow");
  assert.equal(outcome.run.metadata.adaptiveResolution.strategy, "targeted");
  assert.deepEqual(outcome.run.metadata.adaptiveResolution.evidenceAdvice.selected.map((item) => item.id), ["failure", "source"]);

  const resolution = outcome.run.metadata.cognitiveTelemetry.resolution;
  assert.equal(resolution.hardValidated, true);
  assert.equal(resolution.observedTokensToValidatedOutcome, 620);
  assert.equal(resolution.tokenMetricCompleteness, "provider-only");
  assert.equal(resolution.contextBudgetOverflow, false);
  assert.ok(outcome.run.metadata.cognitiveTelemetry.promptHash);
  assert.equal(resolution.maestroPrompt.scope, "maestro-authored-prompt");
  assert.equal(resolution.promptEvaluation.comparisonReady, true);
  assert.equal(resolution.promptEvaluation.recommendationOverlapRate, 0.5);
  assert.equal(resolution.promptEvaluation.selectedAlreadyPresent, 1);
  assert.equal(resolution.promptEvaluation.selectedNovel, 1);
});
