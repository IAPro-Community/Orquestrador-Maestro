#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { ContextEngine } = require("../runtime/context/context-engine");
const { summarizeContextExperimentPairs } = require("../runtime/resolution/context-experiment");
const { POLICY_IDENTITIES } = require("../runtime/resolution/policy-identity");

function parseArgs(argv) {
  const options = { projectPath: process.cwd(), task: "", strategy: "targeted", maxTokens: 8000, out: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") { options.json = true; continue; }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--project-path") options.projectPath = next;
    else if (arg === "--task") options.task = next;
    else if (arg === "--strategy") options.strategy = next;
    else if (arg === "--max-tokens") options.maxTokens = Number.parseInt(next, 10);
    else if (arg === "--out") options.out = next;
    else throw new Error(`Unknown parameter: ${arg}`);
    index += 1;
  }
  if (!options.task.trim()) throw new Error("--task is required");
  if (!["targeted", "balanced", "deep"].includes(options.strategy)) throw new Error("--strategy must be targeted, balanced, or deep");
  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 100) throw new Error("--max-tokens must be an integer >= 100");
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const workspacePath = path.resolve(options.projectPath);
  const engine = new ContextEngine({ workspacePath, semanticRanker: null });
  const pairId = `context-${crypto.randomUUID()}`;
  const taskHash = crypto.createHash("sha256").update(options.task, "utf8").digest("hex");

  await engine.buildContext(options.task, options.maxTokens, {
    adaptiveResolutionMode: "experiment",
    adaptiveResolutionExperiment: { authorized: true, arm: "control", strategy: options.strategy, pairId }
  });
  const control = engine.getLastBuildMetrics();

  await engine.buildContext(options.task, options.maxTokens, {
    adaptiveResolutionMode: "experiment",
    adaptiveResolutionExperiment: { authorized: true, arm: "treatment", strategy: options.strategy, pairId }
  });
  const treatment = engine.getLastBuildMetrics();
  const summary = summarizeContextExperimentPairs([control, treatment]);

  const report = {
    schemaVersion: 1,
    kind: "adaptive-context-benchmark",
    policyId: POLICY_IDENTITIES.CONTEXT_V2.id,
    policyFingerprint: POLICY_IDENTITIES.CONTEXT_V2.fingerprint,
    pairId,
    taskHash,
    taskBytes: Buffer.byteLength(options.task, "utf8"),
    strategy: options.strategy,
    maxTokens: options.maxTokens,
    control,
    treatment,
    summary
  };

  if (options.out) {
    const outPath = path.resolve(options.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Control:   ~${control.estimatedTokens} tokens, brief ${control.briefUsedChars} chars`);
    console.log(`Treatment: ~${treatment.estimatedTokens} tokens, brief ${treatment.briefUsedChars} chars`);
    console.log(`Authority: ${treatment.authorityCoverage.safe ? "preserved" : "fallback"} (${treatment.authorityCoverage.coverageRate})`);
    console.log(`Estimated token savings: ${summary.medianEstimatedTokenSavings ?? "unavailable"}`);
  }
  return report;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
