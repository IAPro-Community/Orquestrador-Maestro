/**
 * CLI entry point for Benchmark Harness v3.
 *
 * Usage:
 *   benchmark run --scenario <path> [--condition vanilla|maestro] [--container] [--evidence <dir>]
 *   benchmark report --evidence <dir> [--output <path>]
 *   benchmark list-scenarios --dir <path>
 *   benchmark validate --scenario <path>
 *
 * @module cli
 */

import { readFile, readdir, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_HARNESS_ROOT = resolve(__dirname, '..', '..');
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { loadScenario, loadAllScenarios } from '../scenarios/loader.js';
import { validateScenario } from '../scenarios/index.js';
import { orchestrateRun, orchestratePair } from '../orchestrator/index.js';
import { OpenCodeDriver } from '../drivers/opencode.js';
import { MaestroDriver } from '../drivers/maestro.js';
import { ContainerRunner } from '../container/runner.js';
import { generateMarkdownReport } from '../reporter/markdown.js';
import { generateJSONReport } from '../reporter/json.js';
import { generateCsvReport } from '../reporter/csv.js';
import { runCmd } from '../utils/run-cmd.js';
import type { BenchmarkRunReport } from '../types/run.js';
import type { BenchmarkReport } from '../types/report.js';
import type { BenchmarkScenario } from '../types/scenario.js';
import { summarizeActionability } from '../metrics/actionability.js';

const HELP = `
Benchmark Harness v3 — Maestro vs Vanilla

Usage:
  benchmark run      --scenario <path> [options]    Run a benchmark
  benchmark pair     --scenario <path> [options]    Run paired comparison
  benchmark report   --evidence <dir> [options]     Generate report
  benchmark list     --dir <path>                   List scenarios
  benchmark validate [--scenario <path>]            Validate one or all scenarios
  benchmark preflight [--scenario <path>]           Check environment readiness
  benchmark inspect  <run-id>                       Show detailed run evidence
  benchmark compare  <dir-a> <dir-b>                Compare two evidence sets
  benchmark suite    [options]                       Run all scenarios in both conditions
  benchmark --help                                  Show this help

Options:
  --condition <vanilla|maestro|maestro-focus>  Condition to run (default: vanilla)
  --container                    Run in container (mandatory for official)
  --evidence <dir>               Evidence output directory
  --model <name>                 Model identifier
  --timeout <ms>                 Timeout in milliseconds
  --output <path>                Report output path
  --format <markdown|json|csv|both|all>  Report format (default: both)
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
    case 'preflight':
      return handlePreflight(args.slice(1));
    case 'inspect':
      return handleInspect(args.slice(1));
    case 'compare':
      return handleCompare(args.slice(1));
    case 'suite':
      return handleSuite(args.slice(1));
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
      evidence: { type: 'string', default: join(CLI_HARNESS_ROOT, 'evidence') },
      model: { type: 'string', default: process.env.BENCHMARK_MODEL ?? 'deepseek/deepseek-v4-flash' },
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
  const evidenceDir = resolve(String(values.evidence ?? join(CLI_HARNESS_ROOT, 'evidence')));
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
  const effectiveModel = profileOverrides.model ?? String(values.model ?? process.env.BENCHMARK_MODEL ?? 'deepseek/deepseek-v4-flash');
  const effectiveTimeout = profileOverrides.timeoutMs ?? parseInt(String(values.timeout ?? '300000'), 10);

  const driver = condition === 'vanilla'
    ? new OpenCodeDriver({ version: '0.1.0' })
    : new MaestroDriver({ version: '0.3.0' });
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
            model: effectiveModel,
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
        model: effectiveModel,
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
      evidence: { type: 'string', default: join(CLI_HARNESS_ROOT, 'evidence') },
      model: { type: 'string', default: process.env.BENCHMARK_MODEL ?? 'deepseek/deepseek-v4-flash' },
      timeout: { type: 'string', default: '300000' },
      image: { type: 'string', default: 'node:20-slim' },
      container: { type: 'boolean', default: true },
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

  const evidenceDir = resolve(String(values.evidence ?? join(CLI_HARNESS_ROOT, 'evidence')));
  await mkdir(evidenceDir, { recursive: true });

  const useContainer = values.container !== false;
  if (useContainer) {
    const containerRunner = new ContainerRunner({ image: String(values.image ?? 'node:20-slim') });
    if (!(await containerRunner.isDockerAvailable())) {
      return { exitCode: 1, message: 'Docker is required for container mode but is not available (use --no-container for local runs, which are not claim-eligible)' };
    }
  }

  const vanillaDriver = new OpenCodeDriver({ version: '0.1.0' });
  const maestroDriver = new MaestroDriver({ version: '0.3.0' });
  const pair = await orchestratePair({
    scenario,
    driver: vanillaDriver,
    maestroDriver,
    evidenceBase: evidenceDir,
    useContainer,
    model: String(values.model ?? process.env.BENCHMARK_MODEL ?? 'deepseek/deepseek-v4-flash'),
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
      evidence: { type: 'string', default: join(CLI_HARNESS_ROOT, 'evidence') },
      output: { type: 'string', default: './benchmark-report' },
      format: { type: 'string', default: 'both' },
    },
    strict: false,
  });

  const evidenceDir = resolve(String(values.evidence ?? join(CLI_HARNESS_ROOT, 'evidence')));
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
  if (format === 'markdown' || format === 'both' || format === 'all') {
    const md = generateMarkdownReport(report);
    await writeFile(`${outputPath}.md`, md, 'utf-8');
  }
  if (format === 'json' || format === 'both' || format === 'all') {
    const json = generateJSONReport(report);
    await writeFile(`${outputPath}.json`, json, 'utf-8');
  }
  if (format === 'csv' || format === 'both' || format === 'all') {
    const csv = generateCsvReport(report);
    await writeFile(`${outputPath}.csv`, csv, 'utf-8');
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
      dir: { type: 'string', default: join(CLI_HARNESS_ROOT, 'scenarios') },
    },
    strict: false,
  });

  const scenariosDir = resolve(String(values.dir ?? join(CLI_HARNESS_ROOT, 'scenarios')));
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
      dir: { type: 'string', default: join(CLI_HARNESS_ROOT, 'scenarios') },
    },
    strict: false,
  });

  const scenarioPath = String(values.scenario ?? '');
  if (!scenarioPath) {
    const scenarios = await loadAllScenarios(resolve(String(values.dir ?? join(CLI_HARNESS_ROOT, 'scenarios'))), { strict: true });
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

async function handlePreflight(args: string[]): Promise<CLIResult> {
  const { values } = parseArgs({
    args,
    options: {
      scenario: { type: 'string' },
      dir: { type: 'string', default: join(CLI_HARNESS_ROOT, 'scenarios') },
      evidence: { type: 'string', default: join(CLI_HARNESS_ROOT, 'evidence') },
    },
    strict: false,
  });

  type PreflightCheck = { name: string; ok: boolean; detail: string };
  const checks: PreflightCheck[] = [];

  // Docker
  try {
    const { stdout } = await runCmd('docker', ['--version'], { timeout: 5_000 });
    checks.push({ name: 'Docker', ok: stdout.includes('Docker version'), detail: stdout.trim() || 'not available' });
  } catch {
    checks.push({ name: 'Docker', ok: false, detail: 'not found' });
  }

  // Node.js
  try {
    const { stdout } = await runCmd('node', ['--version'], { timeout: 5_000 });
    checks.push({ name: 'Node.js', ok: true, detail: stdout.trim() });
  } catch {
    checks.push({ name: 'Node.js', ok: false, detail: 'not found' });
  }

  // OpenCode CLI
  try {
    const { stdout, exitCode } = await runCmd('opencode', ['--version'], { timeout: 5_000 });
    checks.push({ name: 'OpenCode CLI', ok: exitCode === 0, detail: stdout.trim() || 'available' });
  } catch {
    checks.push({ name: 'OpenCode CLI', ok: false, detail: 'not found' });
  }

  // API key
  const apiKey = process.env.BENCHMARK_API_KEY;
  if (apiKey) {
    checks.push({ name: 'API Key (env)', ok: true, detail: `set (${apiKey.slice(0, 4)}...)` });
  } else {
    // Check .env file
    try {
      const envContent = await readFile(resolve('.env'), 'utf-8');
      const match = envContent.match(/^BENCHMARK_API_KEY=(.+)$/m);
      if (match && match[1].length > 0) {
        checks.push({ name: 'API Key (.env)', ok: true, detail: `set (${match[1].slice(0, 4)}...)` });
      } else {
        checks.push({ name: 'API Key', ok: false, detail: 'not configured' });
      }
    } catch {
      checks.push({ name: 'API Key', ok: false, detail: 'not configured' });
    }
  }

  // Scenarios valid
  const scenarioPath = String(values.scenario ?? '');
  const scenariosDir = String(values.dir ?? join(CLI_HARNESS_ROOT, 'scenarios'));
  try {
    if (scenarioPath) {
      const scenario = await loadScenario(resolve(scenarioPath));
      const v = validateScenario(scenario);
      checks.push({ name: 'Scenario', ok: v.valid, detail: v.valid ? scenario.id : v.errors.join('; ') });
    } else {
      const scenarios = await loadAllScenarios(resolve(scenariosDir));
      const valid = scenarios.filter((s) => validateScenario(s).valid).length;
      checks.push({ name: 'Scenarios', ok: valid > 0, detail: `${valid}/${scenarios.length} valid in ${scenariosDir}` });
    }
  } catch (error) {
    checks.push({ name: 'Scenarios', ok: false, detail: error instanceof Error ? error.message : String(error) });
  }

  // Fixtures exist
  const evidenceDir = resolve(String(values.evidence ?? join(CLI_HARNESS_ROOT, 'evidence')));
  try {
    await stat(evidenceDir);
    checks.push({ name: 'Evidence dir', ok: true, detail: evidenceDir });
  } catch {
    checks.push({ name: 'Evidence dir', ok: false, detail: `${evidenceDir} (will be created)` });
  }

  // Format output
  const lines = [
    'Preflight checks:',
    '',
    ...checks.map((c) => `  ${c.ok ? '✅' : '❌'} ${c.name.padEnd(20)} ${c.detail}`),
    '',
    `Result: ${checks.every((c) => c.ok) ? 'All checks passed' : 'Some checks failed'}`,
  ];

  return {
    exitCode: checks.every((c) => c.ok) ? 0 : 1,
    message: lines.join('\n'),
  };
}

async function handleInspect(args: string[]): Promise<CLIResult> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      evidence: { type: 'string', default: './evidence' },
      'raw': { type: 'boolean', default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  const runId = positionals[0];
  if (!runId) {
    return { exitCode: 1, message: 'Error: run ID or path is required\n  Usage: benchmark inspect <run-id> [--evidence <dir>] [--raw]' };
  }

  const evidenceDir = resolve(String(values.evidence ?? './evidence'));
  const showRaw = Boolean(values.raw);

  // Find the run report
  let report: BenchmarkRunReport | null = null;
  let runDir = '';

  // Try as direct path first
  try {
    const reportPath = join(resolve(runId), 'run-report.json');
    const content = await readFile(reportPath, 'utf-8');
    report = JSON.parse(content) as BenchmarkRunReport;
    runDir = resolve(runId);
  } catch {
    // Not a direct path — search by ID
    report = await loadRunReportById(evidenceDir, runId);
    if (report) {
      runDir = join(evidenceDir, runId);
    }
  }

  if (!report) {
    return { exitCode: 1, message: `Run not found: ${runId}\n  Searched in: ${evidenceDir}` };
  }

  const lines = [
    `Run: ${report.runId}`,
    `  Scenario:     ${report.scenarioId}`,
    `  Condition:    ${report.condition}`,
    `  Driver:       ${report.driver.name}@${report.driver.version}`,
    `  Status:       ${report.status}`,
    `  Accepted:     ${report.results.accepted ?? false} (${(report.results.acceptanceRate * 100).toFixed(1)}%)`,
    `  Tokens:       ${report.tokens.total ?? 'unavailable'}`,
    `  Duration:     ${report.timing.durationMs}ms`,
    `  Created:      ${report.createdAt}`,
    `  Fixture:      hash=${report.fixture.hash.slice(0, 12)}...`,
    '',
    '  Acceptance Criteria:',
    ...report.results.criteria.map(
      (c) => `    ${c.passed ? '✅' : '❌'} ${c.name} (${c.type})${c.error ? ` — ${c.error}` : ''}`,
    ),
  ];

  if (report.evidence) {
    lines.push('', '  Evidence:');
    lines.push(`    Raw dir:      ${report.evidence.rawDir}`);
    if (report.evidence.agentExitCode !== undefined) {
      lines.push(`    Agent exit:   ${report.evidence.agentExitCode}`);
    }
    if (report.evidence.verifierExitCode !== undefined) {
      lines.push(`    Verifier exit: ${report.evidence.verifierExitCode}`);
    }
    if (report.evidence.filesChanged && report.evidence.filesChanged.length > 0) {
      lines.push(`    Files changed: ${report.evidence.filesChanged.length}`);
    }
  }

  if (showRaw) {
    lines.push('', '  Raw Evidence Files:');
    try {
      const entries = await readdir(runDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          lines.push(`    ${entry.name}`);
        }
      }
    } catch {
      lines.push('    (unable to list files)');
    }
  }

  return { exitCode: 0, message: lines.join('\n') };
}

async function handleCompare(args: string[]): Promise<CLIResult> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      format: { type: 'string', default: 'table' },
    },
    strict: false,
    allowPositionals: true,
  });

  if (positionals.length < 2) {
    return {
      exitCode: 1,
      message: 'Error: two evidence directories are required\n  Usage: benchmark compare <dir-a> <dir-b> [--format table|json]',
    };
  }

  const dirA = resolve(positionals[0]);
  const dirB = resolve(positionals[1]);
  const format = String(values.format ?? 'table');

  const runsA = await loadRunReports(dirA);
  const runsB = await loadRunReports(dirB);

  if (runsA.length === 0 && runsB.length === 0) {
    return { exitCode: 1, message: `No run reports found in either directory:\n  A: ${dirA}\n  B: ${dirB}` };
  }

  // Group by scenario for each side
  const byScenarioA = groupByScenario(runsA);
  const byScenarioB = groupByScenario(runsB);
  const allScenarios = new Set([...byScenarioA.keys(), ...byScenarioB.keys()]);

  if (format === 'json') {
    const result = {
      dirA,
      dirB,
      summaryA: summarizeRuns(runsA),
      summaryB: summarizeRuns(runsB),
      scenarios: Array.from(allScenarios).map((id) => ({
        id,
        a: byScenarioA.has(id) ? summarizeRuns(byScenarioA.get(id)!) : null,
        b: byScenarioB.has(id) ? summarizeRuns(byScenarioB.get(id)!) : null,
      })),
    };
    return { exitCode: 0, message: JSON.stringify(result, null, 2) };
  }

  // Table format
  const lines = [
    'Comparison:',
    `  A: ${dirA} (${runsA.length} runs)`,
    `  B: ${dirB} (${runsB.length} runs)`,
    '',
  ];

  // Summary row
  const sA = summarizeRuns(runsA);
  const sB = summarizeRuns(runsB);
  lines.push('  Overall:');
  lines.push(`    ${'Metric'.padEnd(20)} ${'A'.padStart(12)} ${'B'.padStart(12)}`);
  lines.push(`    ${'─'.repeat(20)} ${'─'.repeat(12)} ${'─'.repeat(12)}`);
  lines.push(`    ${'Runs'.padEnd(20)} ${String(sA.total).padStart(12)} ${String(sB.total).padStart(12)}`);
  lines.push(`    ${'Accepted'.padEnd(20)} ${String(sA.accepted).padStart(12)} ${String(sB.accepted).padStart(12)}`);
  lines.push(`    ${'Accept Rate'.padEnd(20)} ${(sA.acceptRate * 100).toFixed(1).padStart(11)}% ${(sB.acceptRate * 100).toFixed(1).padStart(11)}%`);
  lines.push(`    ${'Mean Tokens'.padEnd(20)} ${formatTokens(sA.meanTokens).padStart(12)} ${formatTokens(sB.meanTokens).padStart(12)}`);
  lines.push(`    ${'Mean Duration'.padEnd(20)} ${formatDuration(sA.meanDuration).padStart(12)} ${formatDuration(sB.meanDuration).padStart(12)}`);

  // Per-scenario breakdown
  if (allScenarios.size > 0) {
    lines.push('', '  By Scenario:');
    for (const id of allScenarios) {
      const summaryA = byScenarioA.has(id) ? summarizeRuns(byScenarioA.get(id)!) : null;
      const summaryB = byScenarioB.has(id) ? summarizeRuns(byScenarioB.get(id)!) : null;
      lines.push(`    ${id}:`);
      if (summaryA) {
        lines.push(`      A: ${summaryA.accepted}/${summaryA.total} accepted, ${formatTokens(summaryA.meanTokens)} tokens, ${formatDuration(summaryA.meanDuration)}`);
      } else {
        lines.push('      A: (no runs)');
      }
      if (summaryB) {
        lines.push(`      B: ${summaryB.accepted}/${summaryB.total} accepted, ${formatTokens(summaryB.meanTokens)} tokens, ${formatDuration(summaryB.meanDuration)}`);
      } else {
        lines.push('      B: (no runs)');
      }
    }
  }

  return { exitCode: 0, message: lines.join('\n') };
}

async function handleSuite(args: string[]): Promise<CLIResult> {
  const { values } = parseArgs({
    args,
    options: {
      container: { type: 'boolean', default: false },
      evidence: { type: 'string', default: join(CLI_HARNESS_ROOT, 'evidence') },
      model: { type: 'string', default: process.env.BENCHMARK_MODEL ?? 'deepseek/deepseek-v4-flash' },
      timeout: { type: 'string', default: '300000' },
      image: { type: 'string', default: 'node:20-slim' },
      runs: { type: 'string', default: '1' },
      profile: { type: 'string' },
      filter: { type: 'string' },
      dir: { type: 'string', default: join(CLI_HARNESS_ROOT, 'scenarios') },
    },
    strict: false,
  });

  const profile = String(values.profile ?? '');
  const profileOverrides = getProfileOverrides(profile);

  const scenariosDir = resolve(String(values.dir ?? join(CLI_HARNESS_ROOT, 'scenarios')));
  let scenarioFiles: string[];
  try {
    scenarioFiles = readdirSync(scenariosDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => resolve(scenariosDir, f));
  } catch {
    return { exitCode: 1, message: `Scenarios directory not found: ${scenariosDir}` };
  }

  if (scenarioFiles.length === 0) {
    return { exitCode: 1, message: `No scenario files found in ${scenariosDir}` };
  }

  const filter = String(values.filter ?? '');
  const conditions = ['vanilla', 'maestro'] as const;
  const runs = parseInt(String(values.runs ?? '1'), 10) || 1;
  const evidenceBase = String(values.evidence ?? join(CLI_HARNESS_ROOT, 'evidence'));
  const useContainer = Boolean(values.container);
  const model = String(values.model ?? profileOverrides.model ?? process.env.BENCHMARK_MODEL ?? 'deepseek/deepseek-v4-flash');
  const timeout = parseInt(String(values.timeout ?? '300000'), 10) || 300_000;
  const image = String(values.image ?? 'node:20-slim');

  let totalRuns = 0;
  let passedRuns = 0;
  const lines: string[] = [`Running ${scenarioFiles.length} scenarios × ${conditions.length} conditions × ${runs} runs...\n`];

  for (const scenarioFile of scenarioFiles) {
    for (const condition of conditions) {
      for (let run = 0; run < runs; run++) {
        if (filter && !scenarioFile.includes(filter)) continue;

        const scenarioName = basename(scenarioFile, '.json');
        const runLabel = `${scenarioName}/${condition}#${run + 1}`;
        process.stdout.write(`  [${totalRuns + 1}] ${runLabel}...`);

        // Delegate to handleRun via CLI args
        const runArgs = [
          'run',
          '--scenario', scenarioFile,
          '--condition', condition,
          '--evidence', evidenceBase,
          '--model', model,
          '--timeout', String(timeout),
          '--image', image,
        ];
        if (useContainer) runArgs.push('--container');

        // Delegate to CLI via process.argv[0] (node) + this script
        const result = await runCmd(process.execPath, [process.argv[1], ...runArgs], { timeout: timeout + 10_000 });
        totalRuns++;
        if (result.exitCode === 0) passedRuns++;
        process.stdout.write(` ${result.exitCode === 0 ? 'PASS' : 'FAIL'}\n`);
      }
    }
  }

  lines.push(`\nResults: ${passedRuns}/${totalRuns} passed`);
  return { exitCode: passedRuns === totalRuns ? 0 : 1, message: lines.join('\n') };
}

function groupByScenario(runs: BenchmarkRunReport[]): Map<string, BenchmarkRunReport[]> {
  const map = new Map<string, BenchmarkRunReport[]>();
  for (const run of runs) {
    const existing = map.get(run.scenarioId) ?? [];
    existing.push(run);
    map.set(run.scenarioId, existing);
  }
  return map;
}

interface RunSummary {
  total: number;
  accepted: number;
  acceptRate: number;
  meanTokens: number | null;
  meanDuration: number;
}

function summarizeRuns(runs: BenchmarkRunReport[]): RunSummary {
  if (runs.length === 0) {
    return { total: 0, accepted: 0, acceptRate: 0, meanTokens: null, meanDuration: 0 };
  }
  const accepted = runs.filter((r) => r.results.accepted).length;
  const tokenValues = runs.map((r) => r.tokens.total).filter((t): t is number => t !== null);
  const meanTokens = tokenValues.length > 0 ? tokenValues.reduce((a, b) => a + b, 0) / tokenValues.length : null;
  const meanDuration = runs.reduce((sum, r) => sum + r.timing.durationMs, 0) / runs.length;
  return {
    total: runs.length,
    accepted,
    acceptRate: accepted / runs.length,
    meanTokens,
    meanDuration,
  };
}

function formatTokens(tokens: number | null): string {
  if (tokens === null) return 'N/A';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
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
    version: '3',
    createdAt: new Date().toISOString(),
    methodology: {
      description: 'Paired comparison of Maestro vs Vanilla execution',
      containerRequired: runs.every((r) => r.environment?.container === true),
      externalVerifier: true,
      isolatedRuns: runs.every((r) => r.environment?.isolated === true),
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
  maestroFocus?: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
}> {
  const vanillaRuns = runs.filter((r) => r.condition === 'vanilla');
  const maestroRuns = runs.filter((r) => r.condition === 'maestro');
  const maestroFocusRuns = runs.filter((r) => r.condition === 'maestro-focus');

  const pairs: Array<{
    pairId: string;
    scenarioId: string;
    vanilla: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
    maestro: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
    maestroFocus?: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
  }> = [];

  const maxLen = Math.max(vanillaRuns.length, maestroRuns.length, maestroFocusRuns.length);
  for (let i = 0; i < maxLen; i++) {
    const v = vanillaRuns[i];
    const m = maestroRuns[i];
    const mf = maestroFocusRuns[i];
    // Both vanilla and maestro are required to form a pair; maestroFocus is optional
    if (v && m) {
      const pair: {
        pairId: string;
        scenarioId: string;
        vanilla: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
        maestro: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
        maestroFocus?: { runId: string; status: string; accepted: boolean; tokens: number | null; durationMs: number; acceptanceRate: number };
      } = {
        pairId: `pair-${i}`,
        scenarioId: v.scenarioId,
        vanilla: { runId: v.runId, status: v.status, accepted: v.results.accepted ?? false, tokens: v.tokens.total, durationMs: v.timing.durationMs, acceptanceRate: v.results.acceptanceRate },
        maestro: { runId: m.runId, status: m.status, accepted: m.results.accepted ?? false, tokens: m.tokens.total, durationMs: m.timing.durationMs, acceptanceRate: m.results.acceptanceRate },
      };
      if (mf) {
        pair.maestroFocus = { runId: mf.runId, status: mf.status, accepted: mf.results.accepted ?? false, tokens: mf.tokens.total, durationMs: mf.timing.durationMs, acceptanceRate: mf.results.acceptanceRate };
      }
      pairs.push(pair);
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
