/**
 * OpenCode driver implementation.
 *
 * Executes tasks via the `opencode` CLI, captures output,
 * and extracts token usage from session files.
 *
 * @module drivers/opencode
 */

import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentDriver, DriverExecuteOptions, DriverResult, ToolUsage } from '../types/driver.js';
import type { TokenUsage } from '../types/tokens.js';
import { TokenSource, TokenConfidence } from '../types/tokens.js';
import { createUnavailableTokens } from '../utils/tokens.js';

/**
 * OpenCode driver — first official driver for the benchmark harness.
 *
 * Uses `opencode run` CLI. Captures output and attempts token extraction
 * from the session file or text output.
 */
export class OpenCodeDriver implements AgentDriver {
  readonly name = 'opencode';
  readonly version: string;

  private readonly binaryPath: string;

  constructor(options?: { binaryPath?: string; version?: string }) {
    this.binaryPath = options?.binaryPath ?? 'opencode';
    this.version = options?.version ?? '0.1.0';
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.binaryPath, ['--version'], {
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
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 3_000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Wait before retry
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }

      const result = await this.executeOnce(task, options);

      // Check if this is a transient error worth retrying
      if (!this.isSuccessfulResult(result) && this.isTransientError(result.output)) {
        if (attempt < MAX_RETRIES) {
          continue;
        }
      }

      return result;
    }

    // Unreachable, but TypeScript needs it
    throw new Error('execute: exhausted retries');
  }

  private async executeOnce(task: string, options: DriverExecuteOptions): Promise<DriverResult> {
    const startMs = Date.now();

    const args = [
      'run',
      '--dir', options.workspace,
      '--model', options.model,
      '--format', 'json',
      task,
    ];

    let output = '';
    let exitCode = 0;
    let agentOutput = '';

    try {
      const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
        const proc = spawn(this.binaryPath, args, {
          cwd: options.workspace,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, ...(options.env ?? {}) },
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
      // Capture error message so it's visible in evidence
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!output) output = `agent-error: ${errMsg}`;
      if (!agentOutput) agentOutput = `agent-error: ${errMsg}`;
    }

    const endMs = Date.now();
    const durationMs = endMs - startMs;

    // Find session file in workspace
    const sessionFile = await this.findSessionFile(options.workspace);

    // Extract token usage: try session file first, then JSONL stdout
    const tokens = sessionFile
      ? await this.extractTokens(sessionFile)
      : this.extractFromJsonl(agentOutput);

    // Extract tool usage from JSONL
    const toolUsage = this.extractToolUsage(agentOutput);

    return {
      output,
      exitCode,
      tokens,
      durationMs,
      sessionFile: sessionFile ?? '',
      agentOutput,
      toolUsage,
    };
  }

  async getTokenUsage(sessionFile: string): Promise<TokenUsage | null> {
    return this.extractTokens(sessionFile);
  }

  private async findSessionFile(workspace: string): Promise<string | null> {
    try {
      // Check common session locations
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

      // Try parsing as JSON
      try {
        const data = JSON.parse(content) as Record<string, unknown>;
        if (this.hasTokenFields(data)) {
          return this.normalizeTokens(data, TokenSource.OpenCodeNative, TokenConfidence.Exact);
        }
      } catch {
        // Not valid JSON
      }

      // Try JSONL (one JSON per line)
      const lines = content.split('\n').filter(Boolean);
      let lastStats: Record<string, unknown> | null = null;

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as Record<string, unknown>;
          if (this.hasTokenFields(parsed)) {
            lastStats = parsed;
          }
        } catch {
          continue;
        }
      }

      if (lastStats) {
        return this.normalizeTokens(lastStats, TokenSource.SessionDerived, TokenConfidence.Reliable);
      }

      // Fallback: extract from text output
      return this.extractFromText(content);
    } catch {
      return createUnavailableTokens();
    }
  }

  private hasTokenFields(data: Record<string, unknown>): boolean {
    return 'inputTokens' in data || 'outputTokens' in data || 'totalTokens' in data;
  }

  private normalizeTokens(
    data: Record<string, unknown>,
    source: TokenSource,
    confidence: TokenConfidence,
  ): TokenUsage {
    const input = typeof data.inputTokens === 'number' ? data.inputTokens : null;
    const output = typeof data.outputTokens === 'number' ? data.outputTokens : null;
    const reasoning = typeof data.reasoningTokens === 'number' ? data.reasoningTokens : null;
    const cacheRead = typeof data.cacheReadTokens === 'number' ? data.cacheReadTokens : null;
    const cacheWrite = typeof data.cacheWriteTokens === 'number' ? data.cacheWriteTokens : null;

    let total: number | null = null;
    if (typeof data.totalTokens === 'number') {
      total = data.totalTokens;
    } else if (input !== null && output !== null) {
      total = input + output + (reasoning ?? 0);
    }

    return {
      inputTokens: input,
      outputTokens: output,
      reasoningTokens: reasoning,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      total,
      source,
      confidence,
      rawEvidenceRef: source !== TokenSource.Unavailable ? 'session-file' : undefined,
    };
  }

  private extractFromText(text: string): TokenUsage {
    const inputMatch = text.match(/input[_\s]?tokens?[:\s]+(\d[\d,]*)/i);
    const outputMatch = text.match(/output[_\s]?tokens?[:\s]+(\d[\d,]*)/i);
    const totalMatch = text.match(/total[_\s]?tokens?[:\s]+(\d[\d,]*)/i);

    const parse = (s: string | undefined): number | null => {
      if (!s) return null;
      const n = parseInt(s.replace(/,/g, ''), 10);
      return isNaN(n) ? null : n;
    };

    const input = parse(inputMatch?.[1]);
    const output = parse(outputMatch?.[1]);
    const total = parse(totalMatch?.[1]);

    if (input === null && output === null && total === null) {
      return createUnavailableTokens();
    }

    return {
      inputTokens: input,
      outputTokens: output,
      reasoningTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      total: total ?? (input !== null && output !== null ? input + output : null),
      source: TokenSource.SessionDerived,
      confidence: TokenConfidence.Estimated,
      rawEvidenceRef: 'text-parsing',
    };
  }

  /**
   * Extract tokens from JSONL stdout output (--format json).
   *
   * Looks for `step_finish` events which contain token counts:
   * ```json
   * {"type":"step_finish","part":{"tokens":{"total":N,"input":N,"output":N,"reasoning":N,"cache":{"write":N,"read":N}}}}
   * ```
   *
   * Aggregates tokens across all steps (multi-step tasks may have multiple step_finish events).
   */
  private extractFromJsonl(text: string): TokenUsage {
    if (!text) return createUnavailableTokens();

    const lines = text.split('\n').filter(Boolean);
    let totalInput = 0;
    let totalOutput = 0;
    let totalReasoning = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;
    let totalTokens = 0;
    let found = false;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.type !== 'step_finish') continue;

        const part = parsed.part as Record<string, unknown> | undefined;
        if (!part) continue;

        const tokens = part.tokens as Record<string, unknown> | undefined;
        if (!tokens) continue;

        found = true;
        if (typeof tokens.total === 'number') totalTokens += tokens.total;
        if (typeof tokens.input === 'number') totalInput += tokens.input;
        if (typeof tokens.output === 'number') totalOutput += tokens.output;
        if (typeof tokens.reasoning === 'number') totalReasoning += tokens.reasoning;

        const cache = tokens.cache as Record<string, unknown> | undefined;
        if (cache) {
          if (typeof cache.read === 'number') totalCacheRead += cache.read;
          if (typeof cache.write === 'number') totalCacheWrite += cache.write;
        }
      } catch {
        continue;
      }
    }

    if (!found) return createUnavailableTokens();

    return {
      inputTokens: totalInput || null,
      outputTokens: totalOutput || null,
      reasoningTokens: totalReasoning || null,
      cacheReadTokens: totalCacheRead || null,
      cacheWriteTokens: totalCacheWrite || null,
      total: totalTokens || null,
      source: TokenSource.OpenCodeNative,
      confidence: TokenConfidence.Exact,
      rawEvidenceRef: 'jsonl-stdout',
    };
  }

  /**
   * Extract tool usage statistics from JSONL stdout output.
   *
   * Counts tool calls and file operations from `tool_call` and `tool_result` events.
   */
  private extractToolUsage(text: string): ToolUsage | null {
    if (!text) return null;

    const lines = text.split('\n').filter(Boolean);
    let calls = 0;
    let filesRead = 0;
    let filesModified = 0;
    let filesCreated = 0;
    let filesDeleted = 0;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const type = parsed.type as string | undefined;

        if (type === 'tool_call' || type === 'tool-result' || type === 'tool_use') {
          calls++;

          // Extract file operations from tool name or parameters
          const part = parsed.part as Record<string, unknown> | undefined;
          const toolName = (part?.toolName ?? part?.tool ?? part?.name ?? '') as string;
          const state = part?.state as Record<string, unknown> | undefined;
          const input = state?.input as Record<string, unknown> | undefined;
          const params = (input ?? part?.params) as Record<string, unknown> | undefined;
          const filePath = (params?.filePath ?? params?.file_path ?? params?.path ?? '') as string;

          if (toolName.includes('read') || toolName.includes('cat') || toolName.includes('head')) {
            filesRead++;
          } else if (toolName.includes('write') || toolName.includes('create')) {
            if (filePath) filesCreated++;
          } else if (toolName.includes('edit') || toolName.includes('replace') || toolName.includes('sed')) {
            if (filePath) filesModified++;
          } else if (toolName.includes('rm') || toolName.includes('delete') || toolName.includes('remove')) {
            if (filePath) filesDeleted++;
          }
        }
      } catch {
        continue;
      }
    }

    if (calls === 0) return null;

    return { calls, filesRead, filesModified, filesCreated, filesDeleted };
  }



  private isSuccessfulResult(result: DriverResult): boolean {
    return result.exitCode === 0 && result.output.length > 0 && !result.output.includes('agent-error:');
  }

  private isTransientError(output: string): boolean {
    if (!output) return false;
    // Detect OpenCode server errors, API timeouts, rate limits
    const transientPatterns = [
      'Unexpected server error',
      'ECONNRESET',
      'ETIMEDOUT',
      'rate limit',
      '429',
      '502',
      '503',
      'timeout',
    ];
    return transientPatterns.some((p) => output.toLowerCase().includes(p.toLowerCase()));
  }

}
