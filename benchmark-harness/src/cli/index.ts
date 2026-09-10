/**
 * CLI entry point for Benchmark Harness v2.
 *
 * Usage:
 *   benchmark run --scenario <path> [--condition vanilla|maestro] [--container] [--evidence <dir>]
 *   benchmark report --evidence <dir> [--output <path>]
 *   benchmark list-scenarios --dir <path>
 *   benchmark validate --scenario <path>
 *
 * @module cli
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadScenario, loadAllScenarios } from '../scenarios/loader.js';
import { validateScenario } from '../scenarios/index.js';
import { orchestrateRun, orchestratePair } from '../orchestrator/index.js';
import { OpenCodeDriver } from '../drivers/opencode.js';
import { ContainerRunner } from '../container/runner.js';
import { generateMarkdownReport } from '../reporter/markdown.js';
import { generateJSONReport } from '../reporter/json.js';
import type { BenchmarkRunReport } from '../types/run.js';
import type { BenchmarkReport } from '../types/report.js';
import type { BenchmarkScenario } from '../types/scenario.js';
import { summarizeActionability } from '../metrics/actionability.js';

const HELP = `
Benchmark Harness v2 — Maestro vs Vanilla

Usage:
  benchmark run      --scenario <path> [options]    Run a benchmark
  benchmark pair     --scenario <path> [options]    Run paired comparison
  benchmark report   --evidence <dir> [options]     Generate report
  benchmark list     --dir <path>                   List scenarios
  benchmark validate [--scenario <path>]            Validate one or all scenarios
  benchmark --help                                  Show this help

Options:
  --condition <vanilla|maestro|maestro-focus>  Condition to run (default: vanilla)
  --container                    Run in container (mandatory for official)
  --evidence <dir>               Evidence output directory
  --model <name>                 Model identifier
  --timeout <ms>                 Timeout in milliseconds
  --output <path>                Report output path
  --format <markdown|json>       Report format (default: both)
  --image <image>                Docker image for container mode
  --dry-run                      Validate scenario without executing
  --parallel <N>                 Run N scenarios in parallel (default: 1)
  --profile <official|ci>        Predefined configuration profile
  --filter <tag>                 Filter scenarios by tag
  --resume <run-id>              Resume an interrupted run
  --runs <N>                     Number of runs per scenario (default: 1)
`;

interface CLIResult {
  exitCode: number;
  message: string;
}

async function main(): Promise<CLIResult> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { exitCode: 0, message: HELP };
  }

  const command = args[0];

  switch (command) {
    case 'run':
      return handleRun(args.slice(1));
    case 'pair':
      return handlePair(args.slice(1));
    case 'report':
      return handleReport(args.slice(1));
    case 'list':
      return handleList(args.slice(1));
    case 'validate':
      return handleValidate(args.slice(1));
    default:
      return { exitCode: 1, message: `Unknown command: ${command}\n${HELP}` };
  }
}

async function handleRun(args: string[]): Promise<CLIResult> {
  const { values } = parseArgs({
    args,
    options: {
      scenario: { type: 'string' },
      condition: { type: 'string', default: 'vanilla' },
      container: { type: 'boolean', default: false },
      evidence: { type: 'string', default: './evidence' },
      model: { type: 'string', default: 'claude-sonnet-4-20250514' },
      timeout: { type: 'string', default: '300000' },
      image: { type: 'string', default: 'node:20-slim' },
      'dry-run': { type: 'boolean', default: false },
      parallel: { type: 'string', default: '1' },
      profile: { type: 'string' },
      filter: { type: 'string' },
      resume: { type: 'string' },
      runs: { type: 'string', default: '1' },
    },
    strict: false,
  });

  // Apply profile presets
  const profile = String(values.profile ?? '');
  const profileOverrides = getProfileOverrides(profile);

  const scenarioPath = String(values.scenario ?? '');
  if (!scenarioPath) {
    return { exitCode: 1, message: 'Error: --scenario is required' };
  }

  const condition = String(values.condition ?? 'vanilla') as 'vanilla' | 'maestro' | 'maestro-focus';
  if (!['vanilla', 'maestro', 'maestro-focus'].includes(condition)) {
    return { exitCode: 1, message: `Error: --condition must be 'vanilla', 'maestro' or 'maestro-focus', got '${condition}'` };
  }

  // Load and validate scenario
  const scenario = await loadScenario(resolve(scenarioPath));
  const validation = validateScenario(scenario);
  if (!validation.valid) {
    return {
      exitCode: 1,
      message: `Invalid scenario:\n${validation.errors.join('\n')}`,
    };
  }

  // Filter by tag
  const filterTag = String(values.filter ?? '');
  if (filterTag && !(scenario.tags ?? []).includes(filterTag)) {
    return { exitCode: 0, message: `Skipped: ${scenario.id} (no tag '${filterTag}')` };
  }

  // Dry-run mode: validate only
  if (values['dry-run']) {
    return {
      exitCode: 0,
      message: `✓ Dry-run: scenario '${scenario.id}' is valid\n  Task: ${scenario.task.slice(0, 80)}...`,
    };
  }

  // Check container requirement for official benchmarks
  const useContainer = Boolean(values.container);
  if (useContainer) {
    const containerRunner = new ContainerRunner({ image: String(values.image ?? 'node:20-slim') });
    const dockerAvailable = await containerRunner.isDockerAvailable();
    if (!dockerAvailable) {
      return {
        exitCode: 1,
        message: 'Docker is required for --container mode but is not available',
      };
    }
  }

  // Create evidence directory
  const evidenceDir = resolve(String(values.evidence ?? './evidence'));
  await mkdir(evidenceDir, { recursive: true });

  // Resume from interrupted run
  if (values.resume) {
    const runId = String(values.resume);
    const existingReport = await loadRunReportById(evidenceDir, runId);
    if (existingReport) {
      return {
        exitCode: 0,
        message: `Resumed run ${runId}: ${existingReport.status} (${(existingReport.results.acceptanceRate * 100).toFixed(1)}% acceptance)`,
      };
    }
  }

  const runs = parseInt(String(values.runs ?? '1'), 10);
  const parallel = parseInt(String(values.parallel ?? '1'), 10);
  const effectiveModel = profileOverrides.model ?? String(values.model ?? 'claude-sonnet-4-20250514');
  const effectiveTimeout = profileOverrides.timeoutMs ?? parseInt(String(values.timeout ?? '300000'), 10);

  const driver = new OpenCodeDriver({ version: '0.1.0' });
  const results: Array<{ success: boolean; report: BenchmarkRunReport; error?: string }> = [];

  if (parallel > 1) {
    // Parallel execution
    const tasks = Array.from({ length: runs }, (_, i) => i);
    const chunks = chunkArray(tasks, parallel);
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(() =>
          orchestrateRun({
            scenario,
            condition,
            driver,
            evidenceBase: evidenceDir,
            useContainer,
            env: { OPENAI_MODEL: effectiveModel },
            timeoutMs: effectiveTimeout,
          }),
        ),
      );
      results.push(...chunkResults);
    }
  } else {
    // Sequential execution
    for (let i = 0; i < runs; i++) {
      const result = await orchestrateRun({
        scenario,
        condition,
        driver,
        evidenceBase: evidenceDir,
        useContainer,
        env: { OPENAI_MODEL: effectiveModel },
        timeoutMs: effectiveTimeout,
      });
      results.push(result);
    }
  }

  // Output results
  const successCount = results.filter((r) => r.success).length;
  const message = results
    .map((r, i) => {
      const statusIcon = r.success ? '✓' : '✗';
      return [
        `${statusIcon} Run ${i + 1}/${runs}: ${r.report.status}`,
        `  Acceptance Rate: ${(r.report.results.acceptanceRate * 100).toFixed(1)}%`,
        `  Tokens: ${r.report.tokens.total ?? 'unavailable'}`,
        `  Duration: ${r.report.timing.durationMs}ms`,
        r.error ? `  Error: ${r.error}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return {
    exitCode: successCount === runs ? 0 : 1,
    message: `${message}\n\nSummary: ${successCount}/${runs} passed`,
  };
}

async function handlePair(args: string[]): Promise<CLIResult> {
  const { values } = parseArgs({
    args,
    options: {
      scenario: { type: 'string' },
      evidence: { type: 'string', default: './evidence' },
      model: { type: 'string', default: 'claude-sonnet-4-20250514' },
      timeout: { type: 'string', default: '300000' },
      image: { type: 'string', default: 'node:20-slim' },
    },
    strict: false,
  });

  const scenarioPath = String(values.scenario ?? '');
  if (!scenarioPath) {
    return { exitCode: 1, message: 'Error: --scenario is required' };
  }

  const scenario = await loadScenario(resolve(scenarioPath));
  const validation = validateScenario(scenario);
  if (!validation.valid) {
    return {
      exitCode: 1,
      message: `Invalid scenario:\n${validation.errors.join('\n')}`,
    };
  }

  const evidenceDir = resolve(String(values.evidence ?? './evidence'));
  await mkdir(evidenceDir, { recursive: true });

  const driver = new OpenCodeDriver({ version: '0.1.0' });
  const pair = await orchestratePair({
    scenario,
    driver,
    evidenceBase: evidenceDir,
    vanillaEnv: { OPENAI_MODEL: String(values.model ?? 'claude-sonnet-4-20250514') },
    maestroEnv: { OPENAI_MODEL: String(values.model ?? 'claude-sonnet-4-20250514') },
    vanillaTimeoutMs: parseInt(String(values.timeout ?? '300000'), 10),
    maestroTimeoutMs: parseInt(String(values.timeout ?? '300000'), 10),
    maestroFocusTimeoutMs: parseInt(String(values.timeout ?? '300000'), 10),
  });

  const lines = [
    `Paired run: ${scenario.id}`,
    `  Vanilla:  ${pair.vanilla.report.status} (${(pair.vanilla.report.results.acceptanceRate * 100).toFixed(1)}% acceptance, ${pair.vanilla.report.tokens.total ?? 'N/A'} tokens)`,
    `  Maestro:  ${pair.maestro.report.status} (${(pair.maestro.report.results.acceptanceRate * 100).toFixed(1)}% acceptance, ${pair.maestro.report.tokens.total ?? 'N/A'} tokens)`,
    `  Maestro Focus: ${pair.maestroFocus.report.status} (${(pair.maestroFocus.report.results.acceptanceRate * 100).toFixed(1)}% acceptance, ${pair.maestroFocus.report.tokens.total ?? 'N/A'} tokens)`,
  ];

  return {
    exitCode: pair.vanilla.success && pair.maestro.success ? 0 : 1,
    message: lines.join('\n'),
  };
}

async function handleReport(args: string[]): Promise<CLIResult> {
  const { values } = parseArgs({
    args,
    options: {
      evidence: { type: 'string', default: './evidence' },
      output: { type: 'string', default: './benchmark-report' },
      format: { type: 'string', default: 'both' },
    },
    strict: false,
  });

  const evidenceDir = resolve(String(values.evidence ?? './evidence'));
  const outputPath = resolve(String(values.output ?? './benchmark-report'));

  // Load all run reports from evidence directory
  const runs = await loadRunReports(evidenceDir);

  if (runs.length === 0) {
    return { exitCode: 1, message: `No run reports found in ${evidenceDir}` };
  }

  // Build benchmark report
  const report = buildBenchmarkReport(runs);

  // Generate output
  const format = String(values.format ?? 'both');
  if (format === 'markdown' || format === 'both') {
    const md = generateMarkdownReport(report);
    await writeFile(`${outputPath}.md`, md, 'utf-8');
  }
  if (format === 'json' || format === 'both') {
    const json = generateJSONReport(report);
    await writeFile(`${outputPath}.json`, json, 'utf-8');
  }

  return {
    exitCode: 0,
    message: `Report generated: ${outputPath} (${runs.length} runs)`,
  };
}

async function handleList(args: string[]): Promise<CLIResult> {
  const { values } = parseArgs({
    args,
    options: {
      dir: { type: 'string', default: './scenarios' },
    },
    strict: false,
  });

  const scenariosDir = resolve(String(values.dir ?? './scenarios'));
  const scenarios = await loadAllScenarios(scenariosDir);

  if (scenarios.length === 0) {
    return { exitCode: 0, message: `No scenarios found in ${scenariosDir}` };
  }

  const lines = scenarios.map(
    (s) => `  ${s.id} — ${s.name} (tags: ${(s.tags ?? []).join(', ') || 'none'})`,
  );

  return {
    exitCode: 0,
    message: `Scenarios (${scenarios.length}):\n${lines.join('\n')}`,
  };
}

async function handleValidate(args: string[]): Promise<CLIResult> {
  const { values } = parseArgs({
    args,
    options: {
      scenario: { type: 'string' },
      dir: { type: 'string', default: './benchmark-harness/scenarios' },
    },
    strict: false,
  });

  const scenarioPath = String(values.scenario ?? '');
  if (!scenarioPath) {
    const scenarios = await loadAllScenarios(resolve(String(values.dir ?? './benchmark-harness/scenarios')));
    const failures = scenarios.map((scenario) => ({ scenario, result: validateScenario(scenario) })).filter((entry) => !entry.result.valid);
    return failures.length === 0
      ? { exitCode: 0, message: scenarios.map((scenario) => `✓ Scenario '${scenario.id}' is valid`).join('\n') }
      : { exitCode: 1, message: failures.map((entry) => `✗ ${entry.scenario.id}: ${entry.result.errors.join('; ')}`).join('\n') };
  }

  try {
    const scenario = await loadScenario(resolve(scenarioPath));
    const validation = validateScenario(scenario);
    if (validation.valid) {
      return { exitCode: 0, message: `✓ Scenario '${scenario.id}' is valid` };
    } else {
      return {
        exitCode: 1,
        message: `✗ Invalid scenario:\n${validation.errors.join('\n')}`,
      };
    }
  } catch (error) {
    return {
      exitCode: 1,
      message: `Error loading scenario: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// --- Helpers ---

async function loadRunReports(evidenceDir: string): Promise<BenchmarkRunReport[]> {
  const runs: BenchmarkRunReport[] = [];

  try {
    const entries = await readdir(evidenceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const reportPath = join(evidenceDir, entry.name, 'run-report.json');
      try {
        const content = await readFile(reportPath, 'utf-8');
        runs.push(JSON.parse(content) as BenchmarkRunReport);
      } catch {
        // Skip non-report directories
      }
    }
  } catch {
    // Evidence dir doesn't exist
  }

  return runs;
}

function buildBenchmarkReport(runs: BenchmarkRunReport[]): BenchmarkReport {
  // Group by scenario
  const byScenario = new Map<string, BenchmarkRunReport[]>();
  for (const run of runs) {
    const existing = byScenario.get(run.scenarioId) ?? [];
    existing.push(run);
    byScenario.set(run.scenarioId, existing);
  }

  const scenarios = Array.from(byScenario.entries()).map(([id, scenarioRuns]) => ({
    id,
    name: id,
    pairs: buildPairs(scenarioRuns),
  }));

  const vanillaRuns = runs.filter((r) => r.condition === 'vanilla');
  const maestroRuns = runs.filter((r) => r.condition === 'maestro');
  const maestroFocusRuns = runs.filter((r) => r.condition === 'maestro-focus');

  return {
    benchmarkId: `benchmark-${Date.now()}`,
    version: '2',
    createdAt: new Date().toISOString(),
    methodology: {
      description: 'Paired comparison of Maestro vs Vanilla execution',
      containerRequired: true,
      externalVerifier: true,
      isolatedRuns: true,
      goldenFixture: true,
    },
    scenarios,
    pairs: buildPairs(runs),
    summary: {
      totalRuns: runs.length,
      vanillaRuns: vanillaRuns.length,
      maestroRuns: maestroRuns.length,
      maestroFocusRuns: maestroFocusRuns.length,
      acceptanceRates: {
        vanilla: computeAcceptanceRate(vanillaRuns),
        maestro: computeAcceptanceRate(maestroRuns),
        maestroFocus: computeAcceptanceRate(maestroFocusRuns),
      },
      actionability: summarizeActionability(runs),
    },
    claims: [],
    limitations: [
      'Limited sample size — results may not be statistically significant',
      'Single model and driver configuration',
      'Container environment may not reflect all real-world conditions',
    ],
    rawEvidencePath: './evidence',
  };
}

function buildPairs(runs: BenchmarkRunReport[]): Array<{
  pairId: string;
  scenarioId: string;
  vanilla: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
  maestro: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
}> {
  const vanillaRuns = runs.filter((r) => r.condition === 'vanilla');
  const maestroRuns = runs.filter((r) => r.condition === 'maestro');

  const pairs: Array<{
    pairId: string;
    scenarioId: string;
    vanilla: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
    maestro: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
  }> = [];

  const maxLen = Math.max(vanillaRuns.length, maestroRuns.length);
  for (let i = 0; i < maxLen; i++) {
    const v = vanillaRuns[i];
    const m = maestroRuns[i];
    if (v && m) {
      pairs.push({
        pairId: `pair-${i}`,
        scenarioId: v.scenarioId,
        vanilla: { runId: v.runId, status: v.status, accepted: v.results.accepted ?? false, tokens: v.tokens.total, durationMs: v.timing.durationMs, acceptanceRate: v.results.acceptanceRate },
        maestro: { runId: m.runId, status: m.status, accepted: m.results.accepted ?? false, tokens: m.tokens.total, durationMs: m.timing.durationMs, acceptanceRate: m.results.acceptanceRate },
      });
    }
  }

  return pairs;
}

function computeAcceptanceRate(runs: BenchmarkRunReport[]): number {
  if (runs.length === 0) return 0;
  const accepted = runs.filter((r) => r.results.accepted).length;
  return accepted / runs.length;
}

/**
 * Get profile-specific overrides for model and timeout.
 */
function getProfileOverrides(profile: string): { model?: string; timeoutMs?: number } {
  switch (profile) {
    case 'official':
      return { timeoutMs: 600_000 }; // 10 minutes for official benchmarks
    case 'ci':
      return { timeoutMs: 120_000 }; // 2 minutes for CI
    default:
      return {};
  }
}

/**
 * Load a specific run report by ID from the evidence directory.
 */
async function loadRunReportById(
  evidenceDir: string,
  runId: string,
): Promise<BenchmarkRunReport | null> {
  try {
    const entries = await readdir(evidenceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const reportPath = join(evidenceDir, entry.name, 'run-report.json');
      try {
        const content = await readFile(reportPath, 'utf-8');
        const report = JSON.parse(content) as BenchmarkRunReport;
        if (report.runId === runId) return report;
      } catch {
        // Skip
      }
    }
  } catch {
    // Evidence dir doesn't exist
  }
  return null;
}

/**
 * Split an array into chunks of a given size.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Run CLI
main().then((result) => {
  console.log(result.message);
  process.exit(result.exitCode);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
