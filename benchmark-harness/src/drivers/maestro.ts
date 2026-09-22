/**
 * Maestro driver implementation.
 *
 * Executes tasks via the `orquestrador-maestro` CLI, which provides
 * the full Maestro runtime: governance, memory, skill routing, and context.
 *
 * @module drivers/maestro
 */

import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentDriver, DriverExecuteOptions, DriverResult, ToolUsage } from '../types/driver.js';
import type { TokenUsage } from '../types/tokens.js';
import { TokenSource, TokenConfidence } from '../types/tokens.js';
import { createUnavailableTokens } from '../utils/tokens.js';

/**
 * Maestro driver — executes tasks through the Orquestrador Maestro CLI.
 *
 * This provides the REAL Maestro experience: governance, memory, skill routing,
 * interaction profiles, and context injection.
 */
export class MaestroDriver implements AgentDriver {
  readonly name = 'maestro';
  readonly version: string;

  private readonly binaryPath: string;
  private readonly interactionProfile?: string;

  constructor(options?: { binaryPath?: string; version?: string; interactionProfile?: string }) {
    this.binaryPath = options?.binaryPath ?? 'orquestrador-maestro';
    this.version = options?.version ?? '0.3.0';
    this.interactionProfile = options?.interactionProfile;
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.binaryPath, ['version'], {
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.on('close', () => resolve(stdout.trim().length > 0));
      proc.on('error', () => resolve(false));
    });
  }

  async execute(task: string, options: DriverExecuteOptions): Promise<DriverResult> {
    const startMs = Date.now();

    const args = [
      'benchmark', 'run',
      '--scenario', '-',  // inline scenario
      '--condition', this.interactionProfile ? 'maestro-focus' : 'maestro',
      '--model', options.model,
      '--evidence', options.workspace,
    ];

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(options.env ?? {}),
    };
    if (this.interactionProfile) {
      env.MAESTRO_INTERACTION_PROFILE = this.interactionProfile;
    }

    let output = '';
    let exitCode = 0;
    let agentOutput = '';

    try {
      const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
        const proc = spawn(this.binaryPath, args, {
          cwd: options.workspace,
          stdio: ['ignore', 'pipe', 'pipe'],
          env,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));

        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error('timeout'));
        }, options.timeoutMs ?? 300_000);

        proc.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code: code ?? 1 });
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      output = result.stdout + result.stderr;
      agentOutput = result.stdout;
      exitCode = result.code;
    } catch (err) {
      exitCode = 1;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!output) output = `agent-error: ${errMsg}`;
      if (!agentOutput) agentOutput = `agent-error: ${errMsg}`;
    }

    const endMs = Date.now();
    const durationMs = endMs - startMs;

    const sessionFile = await this.findSessionFile(options.workspace);

    const tokens = sessionFile
      ? await this.extractTokens(sessionFile)
      : createUnavailableTokens();

    return {
      output,
      exitCode,
      tokens,
      durationMs,
      sessionFile: sessionFile ?? '',
      agentOutput,
      toolUsage: null,
    };
  }

  private async findSessionFile(workspace: string): Promise<string | null> {
    try {
      const candidates = [
        join(workspace, '.opencode', 'sessions'),
        join(workspace, '.opencode'),
        join(workspace, 'sessions'),
      ];

      for (const dir of candidates) {
        try {
          const files = await readdir(dir);
          const sessionFile = files.find(
            (f) => f.endsWith('.json') || f.endsWith('.jsonl'),
          );
          if (sessionFile) return join(dir, sessionFile);
        } catch {
          continue;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async extractTokens(sessionFile: string): Promise<TokenUsage> {
    try {
      const content = await readFile(sessionFile, 'utf-8');
      try {
        const data = JSON.parse(content) as Record<string, unknown>;
        if ('inputTokens' in data || 'outputTokens' in data || 'totalTokens' in data) {
          return {
            inputTokens: typeof data.inputTokens === 'number' ? data.inputTokens : null,
            outputTokens: typeof data.outputTokens === 'number' ? data.outputTokens : null,
            reasoningTokens: typeof data.reasoningTokens === 'number' ? data.reasoningTokens : null,
            cacheReadTokens: typeof data.cacheReadTokens === 'number' ? data.cacheReadTokens : null,
            cacheWriteTokens: typeof data.cacheWriteTokens === 'number' ? data.cacheWriteTokens : null,
            total: typeof data.totalTokens === 'number' ? data.totalTokens : null,
            source: TokenSource.OpenCodeNative,
            confidence: TokenConfidence.Exact,
          };
        }
      } catch {
        // Not valid JSON
      }
      return createUnavailableTokens();
    } catch {
      return createUnavailableTokens();
    }
  }
}
