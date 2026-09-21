/**
 * Maestro driver implementation.
 *
 * Executes tasks through the real `orquestrador-maestro go --auto` path.
 * Token usage remains unavailable until Maestro can aggregate every model call
 * in the end-to-end mission without double counting.
 *
 * @module drivers/maestro
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AgentDriver, DriverExecuteOptions, DriverExtractionContext, DriverResult } from '../types/driver.js';
import type { TokenUsage } from '../types/tokens.js';
import { TokenConfidence, TokenSource } from '../types/tokens.js';
import { createUnavailableTokens } from '../utils/tokens.js';

const ADAPTIVE_MARKER = 'MAESTRO_ADAPTIVE_POLICY=';
const MISSION_USAGE_MARKER = 'MAESTRO_MISSION_USAGE=';
const CHECKOUT_MAESTRO_BINARY = fileURLToPath(new URL('../../../bin/orquestrador-maestro.js', import.meta.url));

export interface AdaptiveExecutionMetadata {
  confirmed: true;
  policyId: string;
  policyFingerprint: string;
  pairId: string;
  successStrategy: string | null;
  fallbackUsed: boolean;
}

export interface MissionResolutionMetrics {
  state: string;
  taskCount: number;
  validatedTaskCount: number;
  firstPassValidatedTaskCount: number | null;
  failedTaskCount: number;
  blockedTaskCount: number;
  needsAttentionTaskCount: number;
  providerSwitches: number | null;
  automaticRetries: number | null;
  escalations: number | null;
  tokensToValidatedOutcome: number | null;
}

function nonNegativeInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function extractMissionResolutionMetrics(output: string, expectedNonce?: string): MissionResolutionMetrics | null {
  const parsed = findAuthenticatedMarker(output, MISSION_USAGE_MARKER, expectedNonce);
  const resolution = parsed?.resolution;
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) return null;
  const record = resolution as Record<string, unknown>;
  const state = typeof record.state === 'string' ? record.state : '';
  const taskCount = nonNegativeInteger(record.taskCount);
  const validatedTaskCount = nonNegativeInteger(record.validatedTaskCount);
  const failedTaskCount = nonNegativeInteger(record.failedTaskCount);
  const blockedTaskCount = nonNegativeInteger(record.blockedTaskCount);
  const needsAttentionTaskCount = nonNegativeInteger(record.needsAttentionTaskCount);
  if (!state || taskCount === null || validatedTaskCount === null || failedTaskCount === null || blockedTaskCount === null || needsAttentionTaskCount === null) {
    return null;
  }
  return {
    state,
    taskCount,
    validatedTaskCount,
    firstPassValidatedTaskCount: nonNegativeInteger(record.firstPassValidatedTaskCount),
    failedTaskCount,
    blockedTaskCount,
    needsAttentionTaskCount,
    providerSwitches: nonNegativeInteger(record.providerSwitches),
    automaticRetries: nonNegativeInteger(record.automaticRetries),
    escalations: nonNegativeInteger(record.escalations),
    tokensToValidatedOutcome: nonNegativeInteger(record.tokensToValidatedOutcome),
  };
}

export function buildMaestroArgs(
  task: string,
  options: Pick<DriverExecuteOptions, 'workspace' | 'model' | 'condition'>,
  interactionProfile?: string,
): string[] {
  const args = [
    'go',
    task,
    '--auto',
    '--project-path', options.workspace,
    '--provider', 'opencode',
    '--model', options.model,
  ];
  const profile = interactionProfile ?? (options.condition === 'maestro-focus' ? 'focus' : undefined);
  if (profile) args.push('--interaction', profile);
  return args;
}

function findAuthenticatedMarker(output: string, prefix: string, expectedNonce?: string): Record<string, unknown> | null {
  const lines = String(output || '').split(/\r?\n/u).reverse();
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue;
    try {
      const parsed = JSON.parse(line.slice(prefix.length)) as Record<string, unknown>;
      if (expectedNonce && parsed.nonce !== expectedNonce) continue;
      return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

export function extractAdaptiveExecutionMetadata(output: string, expectedNonce?: string): Record<string, unknown> | null {
  const parsed = findAuthenticatedMarker(output, ADAPTIVE_MARKER, expectedNonce);
  if (!parsed) return null;
  try {
    if (
      typeof parsed.policyId !== 'string'
      || typeof parsed.policyFingerprint !== 'string'
      || typeof parsed.pairId !== 'string'
      || !/^[a-f0-9]{64}$/u.test(parsed.policyFingerprint)
    ) return null;
    const adaptiveResolution: AdaptiveExecutionMetadata = {
      confirmed: true,
      policyId: parsed.policyId,
      policyFingerprint: parsed.policyFingerprint,
      pairId: parsed.pairId,
      successStrategy: typeof parsed.successStrategy === 'string' ? parsed.successStrategy : null,
      fallbackUsed: parsed.fallbackUsed === true,
    };
    return { adaptiveResolution };
  } catch {
    return null;
  }
}

export function extractMissionTokenUsage(output: string, expectedNonce?: string): TokenUsage {
  const parsed = findAuthenticatedMarker(output, MISSION_USAGE_MARKER, expectedNonce);
  if (!parsed) return createUnavailableTokens();
  try {
    if (parsed.complete !== true) return createUnavailableTokens();
    const inputTokens = typeof parsed.inputTokens === 'number' ? parsed.inputTokens : null;
    const outputTokens = typeof parsed.outputTokens === 'number' ? parsed.outputTokens : null;
    const reasoningTokens = typeof parsed.reasoningTokens === 'number' ? parsed.reasoningTokens : 0;
    if (inputTokens === null || outputTokens === null) return createUnavailableTokens();
    return {
      inputTokens, outputTokens, reasoningTokens,
      cacheReadTokens: typeof parsed.cacheReadTokens === 'number' ? parsed.cacheReadTokens : null,
      cacheWriteTokens: typeof parsed.cacheWriteTokens === 'number' ? parsed.cacheWriteTokens : null,
      total: inputTokens + outputTokens + reasoningTokens,
      source: TokenSource.ProviderReported, confidence: TokenConfidence.Exact,
      rawEvidenceRef: 'maestro-mission-usage-marker',
    };
  } catch { return createUnavailableTokens(); }
}

export class MaestroDriver implements AgentDriver {
  readonly name = 'maestro';
  readonly version: string;

  private readonly binaryPath: string;
  private readonly interactionProfile?: string;

  constructor(options?: { binaryPath?: string; version?: string; interactionProfile?: string }) {
    this.binaryPath = options?.binaryPath ?? CHECKOUT_MAESTRO_BINARY;
    this.version = options?.version ?? 'unknown';
    this.interactionProfile = options?.interactionProfile;
  }

  private spawnTarget(args: string[]): { command: string; args: string[] } {
    if (this.binaryPath.endsWith('.js')) {
      return { command: process.execPath, args: [this.binaryPath, ...args] };
    }
    return { command: this.binaryPath, args };
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const target = this.spawnTarget(['version']);
      const proc = spawn(target.command, target.args, {
        timeout: 5_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.on('close', () => resolve(stdout.trim().length > 0));
      proc.on('error', () => resolve(false));
    });
  }

  extractMetadata(output: string, context?: DriverExtractionContext): Record<string, unknown> | null {
    const adaptive = extractAdaptiveExecutionMetadata(output, context?.markerNonce);
    const missionResolution = extractMissionResolutionMetrics(output, context?.markerNonce);
    if (!adaptive && !missionResolution) return null;
    return {
      ...(adaptive || {}),
      ...(missionResolution ? { missionResolution } : {}),
    };
  }

  extractTokenUsage(output: string, context?: DriverExtractionContext): TokenUsage {
    return extractMissionTokenUsage(output, context?.markerNonce);
  }

  async execute(task: string, options: DriverExecuteOptions): Promise<DriverResult> {
    const startMs = Date.now();
    const args = buildMaestroArgs(task, options, this.interactionProfile);

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...(options.env ?? {}),
      MAESTRO_BENCHMARK_USAGE: '1',
    };
    const adaptiveKeys = [
      'MAESTRO_ADAPTIVE_POLICY_ID',
      'MAESTRO_ADAPTIVE_POLICY_FINGERPRINT',
      'MAESTRO_ADAPTIVE_PAIR_ID',
    ];
    if (options.condition !== 'maestro-adaptive') {
      for (const key of adaptiveKeys) delete env[key];
    }

    let output = '';
    let exitCode = 0;
    let agentOutput = '';

    try {
      const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
        const target = this.spawnTarget(args);
        const proc = spawn(target.command, target.args, {
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

    return {
      output,
      exitCode,
      tokens: this.extractTokenUsage(output, { markerNonce: options.env?.MAESTRO_BENCHMARK_MARKER_NONCE }),
      durationMs: Date.now() - startMs,
      sessionFile: '',
      agentOutput,
      toolUsage: null,
      metadata: this.extractMetadata(output, { markerNonce: options.env?.MAESTRO_BENCHMARK_MARKER_NONCE }),
    };
  }
}
