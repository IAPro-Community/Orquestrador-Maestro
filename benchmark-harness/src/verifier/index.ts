/**
 * External verifier — runs acceptance criteria against a workspace.
 *
 * The verifier is external to the agent's workspace and never lets the
 * agent decide if it finished correctly.
 * @module verifier
 */

import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(execCb);

/** Result of evaluating a single acceptance criterion. */
export interface CriterionResult {
  type: string;
  name: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

/** Aggregate result of the acceptance suite. */
export interface VerifierResult {
  passed: boolean;
  criteria: CriterionResult[];
  acceptanceRate: number;
}

/** Minimal acceptance config consumed by the verifier. */
export interface AcceptanceConfig {
  criteria: Array<{
    type: string;
    name: string;
    command?: string;
    timeout?: number;
  }>;
  hiddenTestPath?: string;
}

/**
 * Run a single shell command with a timeout.
 * Returns `{ stdout, stderr, exitCode }`.
 */
async function runCommand(
  command: string,
  cwd: string,
  timeoutSec: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutSec * 1000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: 'true', NO_COLOR: '1' },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const nodeErr = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
      code?: number;
      message?: string;
    };
    return {
      stdout: nodeErr.stdout ?? '',
      stderr: nodeErr.stderr ?? nodeErr.message ?? String(err),
      exitCode: nodeErr.status ?? nodeErr.code ?? 1,
    };
  }
}

/** Default timeout per criterion in seconds. */
const DEFAULT_TIMEOUT = 120;

/**
 * Verify acceptance criteria against a workspace.
 *
 * Each criterion runs sequentially. Hidden tests run in the workspace
 * directory (the command itself is self-contained). If a hiddenTestPath
 * is configured AND exists, hidden tests run there instead for isolation.
 *
 * @param workspace    Path to the agent workspace to evaluate.
 * @param acceptance   Acceptance configuration with ordered criteria.
 * @param hiddenTestPath  Optional override for hidden test directory.
 */
export async function verifyAcceptanceSuite(
  workspace: string,
  acceptance: AcceptanceConfig,
  hiddenTestPath?: string,
): Promise<VerifierResult> {
  const results: CriterionResult[] = [];

  for (const criterion of acceptance.criteria) {
    const timeoutSec = criterion.timeout ?? DEFAULT_TIMEOUT;
    const startTime = Date.now();

    let passed = false;
    let output = '';
    let error: string | undefined;

    if (criterion.type === 'hidden_tests') {
      // Hidden tests: run in hiddenTestPath if configured, otherwise in workspace.
      // The command is self-contained (e.g. "node -e ..."), so workspace is fine.
      const hiddenDir = hiddenTestPath ?? acceptance.hiddenTestPath;
      const cwd = hiddenDir && hiddenDir.length > 0 ? hiddenDir : workspace;

      const result = await runCommand(
        criterion.command ?? 'echo "no hidden test command specified"',
        cwd,
        timeoutSec,
      );
      passed = result.exitCode === 0;
      output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      if (!passed) {
        error = result.stderr || `exit code ${result.exitCode}`;
      }
    } else {
      // All other criteria run inside the workspace.
      const result = await runCommand(
        criterion.command ?? 'echo "no command specified"',
        workspace,
        timeoutSec,
      );
      passed = result.exitCode === 0;
      output = [result.stdout, result.stderr].filter(Boolean).join('\n');
      if (!passed) {
        error = result.stderr || `exit code ${result.exitCode}`;
      }
    }

    results.push({
      type: criterion.type,
      name: criterion.name,
      passed,
      duration: Date.now() - startTime,
      output,
      error,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const acceptanceRate =
    results.length > 0 ? passedCount / results.length : 1;

  return {
    passed: results.length === 0 || acceptanceRate === 1,
    criteria: results,
    acceptanceRate,
  };
}
