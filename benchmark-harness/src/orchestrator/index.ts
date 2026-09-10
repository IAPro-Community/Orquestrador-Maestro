/**
 * Run orchestrator — coordinates the full benchmark execution lifecycle.
 *
 * For each scenario × condition pair:
 * 1. Validates scenario
 * 2. Copies golden fixture to temp workspace
 * 3. Initializes git repo in workspace (for diff tracking)
 * 4. Runs agent via Driver
 * 5. Runs external Verifier
 * 6. Checks integrity
 * 7. Captures evidence
 * 8. Produces RunReport
 *
 * @module orchestrator
 */

import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { BenchmarkScenario } from '../types/scenario.js';
import type { BenchmarkRunReport, RunStatus, Condition } from '../types/run.js';
import type { AgentDriver, DriverExecuteOptions } from '../types/driver.js';
import type { TokenUsage } from '../types/tokens.js';
import { TokenSource, TokenConfidence } from '../types/tokens.js';
import { hashFixture, copyFixtureToTemp } from '../fixtures/index.js';
import { verifyAcceptanceSuite } from '../verifier/index.js';
import { checkBenchmarkIntegrity } from '../verifier/integrity.js';
import { preserveRawEvidence, sanitizeSecrets } from '../evidence/index.js';

/**
 * Run a shell command via spawn. Returns { stdout, exitCode }.
 */
async function runCmd(
  command: string,
  args: string[],
  opts: { cwd: string; timeout?: number },
): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.on('close', (code) => resolve({ stdout, exitCode: code ?? 1 }));
    proc.on('error', () => resolve({ stdout: '', exitCode: 1 }));
  });
}

/** Orchestration options. */
export interface OrchestrateOptions {
  /** Scenario to execute. */
  scenario: BenchmarkScenario;
  /** Condition under which to run. */
  condition: Condition;
  /** Agent driver to use. */
  driver: AgentDriver;
  /** Base directory for evidence output. */
  evidenceBase: string;
  /** Whether to run in a container. */
  useContainer?: boolean;
  /** Additional environment variables. */
  env?: Record<string, string>;
  /** Override timeout (ms). */
  timeoutMs?: number;
}

/** Single run result. */
export interface OrchestrateResult {
  report: BenchmarkRunReport;
  success: boolean;
  error?: string;
}

/**
 * Run a single benchmark: scenario + condition + driver.
 */
export async function orchestrateRun(
  options: OrchestrateOptions,
): Promise<OrchestrateResult> {
  const {
    scenario,
    condition,
    driver,
    evidenceBase,
    useContainer = false,
    env = {},
    timeoutMs,
  } = options;

  const runId = randomUUID();
  const startMs = Date.now();

  try {
    // 1. Compute fixture hash
    const fixtureHash = await hashFixture(scenario.fixture.path);

    // 2. Copy golden fixture to temp workspace
    const workspace = await copyFixtureToTemp(scenario.fixture.path, runId);

    // 3. Initialize git repo in workspace (for diff tracking)
    await initGitRepo(workspace);

    // 4. Create evidence directory (single location, no double creation)
    const evidenceDir = join(evidenceBase, runId);
    await mkdir(evidenceDir, { recursive: true });

    // 5. Compute task hash
    const taskHash = computeHash(scenario.task);

    // 6. Run the agent
    const driverOptions: DriverExecuteOptions = {
      workspace,
      fixture: scenario.fixture.path,
      timeoutMs: timeoutMs ?? scenario.limits.maxTimeMs ?? 300_000,
      model: scenario.model ?? 'claude-sonnet-4-20250514',
      env,
    };

    const task = condition === 'maestro-focus'
      ? `${scenario.task}\n\nInteraction profile: focus\nCommunication requirements: expose current state; show next action when required; suppress unrelated tangents; completion requires evidence.`
      : scenario.task;
    const driverResult = await driver.execute(task, driverOptions);

    // 7. Run external verifier
    const verifierResult = await verifyAcceptanceSuite(
      workspace,
      scenario.acceptance,
      scenario.acceptance.hiddenTestPath,
    );

    // 8. Check benchmark integrity
    const integrityResult = await checkBenchmarkIntegrity({
      scenarioHash: scenario.integrity?.scenarioHash,
      hiddenTestsHash: scenario.integrity?.hiddenTestsHash,
      verifierHash: scenario.integrity?.verifierHash,
      workspace,
    });

    // 9. Determine status
    let status: RunStatus;
    let failureType: string | undefined;

    if (!integrityResult.valid) {
      status = 'benchmark-integrity-violation';
      failureType = integrityResult.violations.join('; ');
    } else if (driverResult.exitCode !== 0 && !verifierResult.passed) {
      status = 'failed';
      failureType = 'agent-error-and-acceptance-failure';
    } else if (driverResult.exitCode !== 0) {
      status = 'failed';
      failureType = 'agent-error';
    } else if (!verifierResult.passed) {
      status = 'failed';
      failureType = 'acceptance-failure';
    } else {
      status = 'passed';
    }

    // 10. Capture evidence
    const filesChanged = await getFilesChanged(workspace);
    const gitDiff = await getGitDiff(workspace);

    const evidence = await preserveRawEvidence({
      workspace,
      runId,
      agentOutput: sanitizeSecrets(driverResult.output),
      agentExitCode: driverResult.exitCode,
      verifierOutput: sanitizeSecrets(JSON.stringify(verifierResult, null, 2)),
      verifierExitCode: verifierResult.passed ? 0 : 1,
      sessionFile: driverResult.sessionFile,
      gitDiff,
      filesChanged,
      evidenceBase,
    });

    // 11. Build run report
    const endMs = Date.now();
    const report: BenchmarkRunReport = {
      runId,
      scenarioId: scenario.id,
      condition,
      driver: {
        name: driver.name,
        version: driver.version,
        config: { model: driverOptions.model },
      },
      fixture: {
        path: scenario.fixture.path,
        hash: fixtureHash,
      },
      taskHash,
      environment: {
        os: process.platform,
        arch: process.arch,
        container: useContainer,
        nodeVersion: process.version,
        isolated: useContainer,
      },
      status,
      failureType,
      results: {
        acceptanceRate: verifierResult.acceptanceRate,
        accepted: verifierResult.passed,
        criteria: verifierResult.criteria.map((c) => ({
          type: c.type,
          name: c.name,
          passed: c.passed,
          duration: c.duration,
          output: c.output ? sanitizeSecrets(c.output) : undefined,
          error: c.error,
        })),
      },
      tokens: driverResult.tokens ?? createUnavailableTokens(),
      toolUsage: driverResult.toolUsage ?? null,
      timing: {
        startMs,
        endMs,
        durationMs: endMs - startMs,
      },
      evidence: {
        rawDir: evidence.rawDir,
        agentOutput: evidence.agentOutput,
        verifierOutput: evidence.verifierOutput,
        agentExitCode: driverResult.exitCode,
        verifierExitCode: verifierResult.passed ? 0 : 1,
        filesChanged,
        gitDiff,
        sessionFile: driverResult.sessionFile,
      },
      createdAt: new Date().toISOString(),
    };

    // 12. Write report to evidence directory
    await writeFile(
      join(evidence.rawDir, 'run-report.json'),
      JSON.stringify(report, null, 2),
      'utf-8',
    );

    return {
      report,
      success: status === 'passed',
    };
  } catch (error) {
    const endMs = Date.now();
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Write error report to evidence directory so it's not lost
    const errorEvidenceDir = join(evidenceBase, runId);
    try {
      await mkdir(errorEvidenceDir, { recursive: true });
      const errorReport: BenchmarkRunReport = {
        runId,
        scenarioId: scenario.id,
        condition,
        driver: { name: driver.name, version: driver.version },
        fixture: { path: scenario.fixture.path, hash: '' },
        status: 'error',
        failureType: errorMsg,
        results: { acceptanceRate: 0, criteria: [] },
        tokens: createUnavailableTokens(),
        timing: { startMs, endMs, durationMs: endMs - startMs },
        evidence: {
          rawDir: errorEvidenceDir,
          agentOutput: '',
          verifierOutput: '',
        },
        createdAt: new Date().toISOString(),
      };
      await writeFile(
        join(errorEvidenceDir, 'run-report.json'),
        JSON.stringify(errorReport, null, 2),
        'utf-8',
      );
      return {
        report: errorReport,
        success: false,
        error: errorMsg,
      };
    } catch {
      // Fallback if even evidence write fails
      return {
        report: {
          runId,
          scenarioId: scenario.id,
          condition,
          driver: { name: driver.name, version: driver.version },
          fixture: { path: scenario.fixture.path, hash: '' },
          status: 'error',
          failureType: errorMsg,
          results: { acceptanceRate: 0, criteria: [] },
          tokens: createUnavailableTokens(),
          timing: { startMs, endMs, durationMs: endMs - startMs },
          evidence: { rawDir: '', agentOutput: '', verifierOutput: '' },
          createdAt: new Date().toISOString(),
        } as BenchmarkRunReport,
        success: false,
        error: errorMsg,
      };
    }
  }
}

/**
 * Run paired benchmarks: same scenario, both conditions.
 */
export async function orchestratePair(options: {
  scenario: BenchmarkScenario;
  driver: AgentDriver;
  evidenceBase: string;
  vanillaEnv?: Record<string, string>;
  maestroEnv?: Record<string, string>;
  vanillaTimeoutMs?: number;
  maestroTimeoutMs?: number;
  maestroFocusEnv?: Record<string, string>;
  maestroFocusTimeoutMs?: number;
}): Promise<{
  vanilla: OrchestrateResult;
  maestro: OrchestrateResult;
  maestroFocus: OrchestrateResult;
}> {
  const vanilla = await orchestrateRun({
    scenario: options.scenario,
    condition: 'vanilla',
    driver: options.driver,
    evidenceBase: options.evidenceBase,
    useContainer: true,
    env: options.vanillaEnv,
    timeoutMs: options.vanillaTimeoutMs,
  });

  const maestro = await orchestrateRun({
    scenario: options.scenario,
    condition: 'maestro',
    driver: options.driver,
    evidenceBase: options.evidenceBase,
    useContainer: true,
    env: options.maestroEnv,
    timeoutMs: options.maestroTimeoutMs,
  });

  const maestroFocus = await orchestrateRun({
    scenario: options.scenario,
    condition: 'maestro-focus',
    driver: options.driver,
    evidenceBase: options.evidenceBase,
    useContainer: true,
    env: options.maestroFocusEnv ?? { ...options.maestroEnv, MAESTRO_INTERACTION_PROFILE: 'focus' },
    timeoutMs: options.maestroFocusTimeoutMs ?? options.maestroTimeoutMs,
  });

  return { vanilla, maestro, maestroFocus };
}

// --- Helpers ---

function computeHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Initialize a git repo in the workspace so git diff works.
 * This enables tracking files changed by the agent.
 */
async function initGitRepo(workspace: string): Promise<void> {
  try {
    await runCmd('git', ['init'], { cwd: workspace, timeout: 5_000 });
    await runCmd('git', ['add', '-A'], { cwd: workspace, timeout: 5_000 });
    await runCmd(
      'git',
      ['commit', '-m', 'initial: golden fixture', '--allow-empty'],
      { cwd: workspace, timeout: 5_000 },
    );
  } catch {
    // Git not available — diff will be empty, which is handled
  }
}

async function getFilesChanged(workspace: string): Promise<string[]> {
  try {
    const { stdout } = await runCmd('git', ['diff', '--name-only', 'HEAD'], {
      cwd: workspace,
      timeout: 5_000,
    });
    return stdout.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function getGitDiff(workspace: string): Promise<string> {
  try {
    const { stdout } = await runCmd('git', ['diff', 'HEAD'], {
      cwd: workspace,
      timeout: 10_000,
    });
    return stdout;
  } catch {
    return '';
  }
}

function createUnavailableTokens(): TokenUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    total: null,
    source: TokenSource.Unavailable,
    confidence: TokenConfidence.Unavailable,
  };
}
