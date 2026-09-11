/**
 * Shared runCmd helper for spawning shell commands.
 * @module utils/run-cmd
 */

import { spawn } from 'node:child_process';

/**
 * Run a shell command via spawn. Returns { stdout, exitCode }.
 * On spawn error (e.g. command not found), exitCode is 1 and stdout is empty.
 */
export async function runCmd(
  command: string,
  args: string[],
  opts: { cwd?: string; timeout?: number },
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
