import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execSync } from "node:child_process";
import { getDriver } from "./drivers";
import { runHiddenTests } from "./verifier";
import { evaluateEvidence, summarizeEvidence } from "./evidence";
import { compareConditions } from "./metrics";
import { generateMarkdownReport, generateJsonReport } from "./reporter";
import { validateRunResult, validateScenario } from "./schema";
import type { Scenario, RunResult, BenchmarkCondition, ComparisonResult } from "./types";
import type { AgentDriver } from "./drivers/agent-driver";

declare const __dirname: string;

const SCENARIOS_DIR = path.join(__dirname, "..", "scenarios");
const FIXTURES_DIR = path.join(SCENARIOS_DIR, "_fixtures");

function calculatePromptHash(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex");
}

function getEnvironment(): { os: string; nodeVersion: string; platform: string; arch: string; timestamp: string } {
  return {
    os: `${os.type()} ${os.release()}`,
    nodeVersion: process.version,
    platform: process.platform,
    arch: os.arch(),
    timestamp: new Date().toISOString(),
  };
}

function getRepoCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return "unknown";
  }
}

function loadScenario(scenarioId: string): Scenario {
  const scenarioPath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }
  return JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
}

function listScenarios(): string[] {
  if (!fs.existsSync(SCENARIOS_DIR)) return [];
  return fs.readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

function setupWorkspace(scenario: Scenario): string {
  const fixtureDir = scenario.fixtureDir.replace(/^_fixtures\//, "");
  const fixturePath = path.join(FIXTURES_DIR, fixtureDir);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-v2-"));
  copyDirRecursive(fixturePath, tmpDir);

  return tmpDir;
}

function copyDirRecursive(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanupWorkspace(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`Warning: Failed to cleanup ${tmpDir}: ${(error as Error).message}`);
  }
}

function saveResult(result: RunResult, outputDir: string): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `${result.benchmark}_${result.condition}_run${result.run}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2), "utf8");

  return filepath;
}

interface RunSingleOptions {
  model?: string;
  variant?: string;
  timeoutMs?: number;
  repoCommit: string;
}

async function runSingle(
  scenario: Scenario,
  condition: BenchmarkCondition,
  runNumber: number,
  driver: AgentDriver,
  options: RunSingleOptions
): Promise<RunResult> {
  const tmpDir = setupWorkspace(scenario);

  try {
    const driverResult = await driver.execute(scenario, {
      condition,
      model: options.model || "unknown",
      variant: options.variant,
      workDir: tmpDir,
      timeoutMs: options.timeoutMs || 120000,
    });

    const validation = await runHiddenTests(tmpDir, scenario);

    const evidence = evaluateEvidence(driverResult, validation, {
      expectedExitCode: scenario.validation?.expectedExitCode ?? 0,
    });

    const result: RunResult = {
      benchmark: scenario.id,
      condition,
      run: runNumber,
      model: options.model || "unknown",
      driver: driver.name,
      repoCommit: options.repoCommit,
      promptHash: calculatePromptHash(scenario.prompt),
      environment: getEnvironment(),
      driverResult,
      validation,
      evidence,
      metadata: {
        durationMs: driverResult.durationMs,
        retries: 0,
        notes: "",
      },
    };

    const schemaValidation = validateRunResult(result);
    if (!schemaValidation.valid) {
      result.metadata.notes = `Schema validation: ${schemaValidation.errors.join("; ")}`;
    }

    return result;
  } finally {
    cleanupWorkspace(tmpDir);
  }
}

interface RunBenchmarkOptions {
  driver?: string;
  model?: string;
  variant?: string;
  conditions?: BenchmarkCondition[];
  runs?: number;
  repoCommit?: string;
  outputDir?: string;
  timeoutMs?: number;
}

async function runBenchmark(scenarioIds: string[], options: RunBenchmarkOptions = {}): Promise<RunResult[]> {
  const driverName = options.driver || "opencode";
  const driver = getDriver(driverName);
  if (!driver) throw new Error(`Unknown driver: ${driverName}`);

  const available = await driver.isAvailable();
  if (!available) throw new Error(`Driver not available: ${driverName}`);

  const conditions = options.conditions || ["vanilla", "maestro-core"];
  const runsPerScenario = options.runs || 3;
  const repoCommit = options.repoCommit || getRepoCommit();
  const outputDir = options.outputDir || path.join(__dirname, "..", "results");

  const results: RunResult[] = [];

  for (const scenarioId of scenarioIds) {
    const scenario = loadScenario(scenarioId);
    const scenarioValidation = validateScenario(scenario);
    if (!scenarioValidation.valid) {
      console.error(`Invalid scenario ${scenarioId}: ${scenarioValidation.errors.join("; ")}`);
      continue;
    }

    for (const condition of conditions) {
      for (let run = 1; run <= runsPerScenario; run++) {
        console.log(`Running ${scenarioId} / ${condition} / run ${run}`);
        const result = await runSingle(scenario, condition, run, driver, {
          ...options,
          repoCommit,
        });
        saveResult(result, outputDir);
        results.push(result);
      }
    }
  }

  return results;
}

interface GenerateReportOptions {
  repoCommit?: string;
  model?: string;
  driver?: string;
}

interface BenchmarkReportResult {
  markdown: string;
  json: string;
  comparisons: ComparisonResult[];
  evidenceSummary: {
    totalRuns: number;
    claimEligibleRuns: number;
    hasMixedEvidence: boolean;
    publicClaimEligible: boolean;
  };
}

function generateReport(results: RunResult[], options: GenerateReportOptions = {}): BenchmarkReportResult {
  const conditions = [...new Set(results.map((r) => r.condition))];
  const scenarioIds = [...new Set(results.map((r) => r.benchmark))];

  const comparisons: ComparisonResult[] = [];
  for (const scenarioId of scenarioIds) {
    const vanillaResults = results.filter((r) => r.benchmark === scenarioId && r.condition === "vanilla");
    const maestroResults = results.filter((r) => r.benchmark === scenarioId && r.condition === "maestro-core");

    if (vanillaResults.length > 0 && maestroResults.length > 0) {
      comparisons.push({
        scenarioId,
        ...compareConditions(vanillaResults, maestroResults),
      });
    }
  }

  const evidenceSummary = summarizeEvidence(results);

  return {
    markdown: generateMarkdownReport(results, comparisons, options),
    json: generateJsonReport(results, comparisons, options),
    comparisons,
    evidenceSummary,
  };
}

export {
  runBenchmark,
  runSingle,
  generateReport,
  loadScenario,
  listScenarios,
  setupWorkspace,
  cleanupWorkspace,
  saveResult,
  calculatePromptHash,
  getEnvironment,
  getRepoCommit,
};
