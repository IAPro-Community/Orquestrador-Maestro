#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { buildResolutionDataset } = require("../runtime/resolution/experiment-dataset");
const { POLICY_IDENTITIES, resolvePolicyFingerprint, resolvePolicyIdentity } = require("../runtime/resolution/policy-identity");
const { DEFAULT_PROMOTION_POLICY, evaluatePromotionGate } = require("../runtime/resolution/promotion-gate");

function parseArgs(argv) {
  const options = {
    reports: [],
    evidenceDirs: [],
    baselineCondition: "maestro",
    treatmentCondition: "maestro-adaptive",
    candidatePolicy: POLICY_IDENTITIES.PROGRESSIVE_PLANNING_V3.id,
    minPairs: DEFAULT_PROMOTION_POLICY.minHardValidatedPairs,
    out: null,
    json: false,
    requirePromotable: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--require-promotable") { options.requirePromotable = true; continue; }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--report") options.reports.push(next);
    else if (arg === "--benchmark-evidence") options.evidenceDirs.push(next);
    else if (arg === "--baseline-condition") options.baselineCondition = next;
    else if (arg === "--treatment-condition") options.treatmentCondition = next;
    else if (arg === "--candidate-policy") options.candidatePolicy = next;
    else if (arg === "--min-pairs") options.minPairs = Number.parseInt(next, 10);
    else if (arg === "--out") options.out = next;
    else throw new Error(`Unknown parameter: ${arg}`);
    index += 1;
  }
  if (!Number.isInteger(options.minPairs) || options.minPairs < 1) throw new Error("--min-pairs must be a positive integer");
  if (options.reports.length === 0 && options.evidenceDirs.length === 0) {
    throw new Error("Provide at least one --report or --benchmark-evidence directory");
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}

async function loadEvidenceDir(dirPath) {
  const root = path.resolve(dirPath);
  const runs = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return runs;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const reportPath = path.join(root, entry.name, "run-report.json");
    try {
      const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
      if (report && typeof report === "object") runs.push(report);
    } catch {
      // Ignore directories that are not benchmark run evidence.
    }
  }
  return runs;
}

function classifyLoaded(value, adaptiveReports, benchmarkRuns) {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (!item || typeof item !== "object") continue;
    if (item.kind === "adaptive-context-benchmark" || item.kind === "adaptive-planning-benchmark") adaptiveReports.push(item);
    else if (typeof item.condition === "string" && item.results && item.timing) benchmarkRuns.push(item);
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const adaptiveReports = [];
  const benchmarkRuns = [];

  for (const filePath of options.reports) classifyLoaded(await readJson(filePath), adaptiveReports, benchmarkRuns);
  for (const dirPath of options.evidenceDirs) benchmarkRuns.push(...await loadEvidenceDir(dirPath));

  const candidatePolicyFingerprint = resolvePolicyFingerprint(options.candidatePolicy);
  const candidatePolicyIdentity = resolvePolicyIdentity(options.candidatePolicy);
  const dataset = buildResolutionDataset({
    adaptiveReports,
    benchmarkRuns,
    baselineCondition: options.baselineCondition,
    treatmentCondition: options.treatmentCondition
  });
  const gate = evaluatePromotionGate(dataset, {
    candidatePolicyFingerprint,
    policy: {
      minHardValidatedPairs: options.minPairs,
      minTokenComparablePairs: options.minPairs
    }
  });
  const evaluation = {
    schemaVersion: 1,
    candidatePolicyId: candidatePolicyIdentity?.id || null,
    candidatePolicyFingerprint,
    datasetFingerprint: dataset.datasetFingerprint,
    dataset,
    gate
  };

  if (options.out) {
    const outPath = path.resolve(options.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(evaluation, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  }

  if (options.json) {
    console.log(JSON.stringify(evaluation, null, 2));
  } else {
    console.log(`Adaptive Resolution policy: ${candidatePolicyIdentity?.id || options.candidatePolicy}`);
    console.log(`Policy fingerprint: ${candidatePolicyFingerprint}`);
    console.log(`Dataset fingerprint: ${dataset.datasetFingerprint}`);
    console.log(`Dataset samples: ${dataset.summary.samples}`);
    console.log(`Hard validated / policy-bound / valid: ${gate.evidence.candidateHardPairs} / ${gate.evidence.policyBoundHardPairs} / ${gate.evidence.validHardPairs}`);
    console.log(`Token-comparable pairs: ${gate.evidence.tokenComparablePairs}`);
    console.log(`Acceptance delta: ${gate.quality.acceptanceRateDelta ?? "unavailable"}`);
    console.log(`Median token savings: ${gate.economy.medianTokenSavings ?? "unavailable"}`);
    console.log(`Decision: ${gate.decision}`);
    if (gate.blockers.length > 0) console.log(`Blockers: ${gate.blockers.join(", ")}`);
    if (options.out) console.log("Evaluation written to the requested output path.");
  }

  if (options.requirePromotable && !gate.promotionReady) process.exitCode = 2;
  return evaluation;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs, loadEvidenceDir, classifyLoaded };
