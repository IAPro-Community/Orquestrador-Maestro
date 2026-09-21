/**
 * Evidence model — raw artifacts produced by agent and verifier runs.
 *
 * Uses async fs operations for consistency with the rest of the codebase.
 * @module evidence
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BenchmarkRunReport } from '../types/run.js';

/** Descriptor for an evidence directory. */
export interface EvidenceDir {
  /** Unique run identifier. */
  runId: string;
  /** Absolute path to the evidence directory. */
  rawDir: string;
  /** Paths to raw captured files. */
  rawFiles: string[];
  /** Full agent output (stdout + stderr). */
  agentOutput: string;
  /** Full verifier output (stdout + stderr). */
  verifierOutput: string;
}

/** Options for preserving raw evidence from a benchmark run. */
export interface PreserveRawEvidenceOptions {
  /** Workspace root path. */
  workspace: string;
  /** Unique run identifier. */
  runId: string;
  /** Full agent output (stdout + stderr). */
  agentOutput: string;
  /** Agent process exit code. */
  agentExitCode: number;
  /** Full verifier output (stdout + stderr). */
  verifierOutput: string;
  /** Verifier process exit code. */
  verifierExitCode: number;
  /** Path to the agent session file. */
  sessionFile: string;
  /** Git diff of the workspace after the run. */
  gitDiff?: string;
  /** List of files changed by the agent. */
  filesChanged?: string[];
  /** Override base directory for evidence (default: workspace/evidence). */
  evidenceBase?: string;
}

const TIMESTAMP_FORMAT = (d: Date): string =>
  d.toISOString().replace(/[:.]/g, '-');

/**
 * Creates a timestamped evidence directory under `basePath`.
 *
 * @returns Absolute path to the newly created directory.
 */
export async function createEvidenceDir(basePath: string, runId: string): Promise<string> {
  const ts = TIMESTAMP_FORMAT(new Date());
  const dirName = `${runId}_${ts}`;
  const dirPath = join(basePath, dirName);
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Patterns that look like secrets and should be scrubbed from evidence output.
 */
const SECRET_PATTERNS: RegExp[] = [
  // API keys (OpenAI, Anthropic, generic)
  /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9\-_]{20,}["']?/gi,
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9\-_\.]{20,}/g,
  // GitHub tokens
  /gh[ps]_[A-Za-z0-9\-_]{36,}/g,
  // Generic tokens
  /(?:token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}["']?/gi,
  // AWS keys
  /AKIA[0-9A-Z]{16}/g,
  // JWT-like
  /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
];

/**
 * Removes API keys, tokens, passwords, and other secrets from content.
 *
 * @returns Sanitized content with secrets replaced by `[REDACTED]`.
 */
export function sanitizeSecrets(content: string): string {
  let result = content;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Persists raw evidence from a benchmark run to disk and returns
 * an {@link EvidenceDir} descriptor.
 *
 * All output is secret-sanitized before writing.
 */
export async function preserveRawEvidence(options: PreserveRawEvidenceOptions): Promise<EvidenceDir> {
  const {
    workspace,
    runId,
    agentOutput,
    agentExitCode,
    verifierOutput,
    verifierExitCode,
    sessionFile,
    gitDiff,
    filesChanged,
    evidenceBase,
  } = options;

  const evidencePath = evidenceBase
    ? join(evidenceBase, runId)
    : join(workspace, 'evidence', runId);
  await mkdir(evidencePath, { recursive: true });
  const rawFiles: string[] = [];

  // Agent output
  const agentFile = join(evidencePath, 'agent-output.txt');
  await writeFile(agentFile, sanitizeSecrets(agentOutput), 'utf-8');
  rawFiles.push(agentFile);

  // Verifier output
  const verifierFile = join(evidencePath, 'verifier-output.txt');
  await writeFile(verifierFile, sanitizeSecrets(verifierOutput), 'utf-8');
  rawFiles.push(verifierFile);

  // Session metadata
  const sessionMeta = {
    runId,
    agentExitCode,
    verifierExitCode,
    sessionFile,
    capturedAt: new Date().toISOString(),
  };
  const sessionFilePath = join(evidencePath, 'session.json');
  await writeFile(sessionFilePath, JSON.stringify(sessionMeta, null, 2), 'utf-8');
  rawFiles.push(sessionFilePath);

  // Optional git diff
  if (gitDiff !== undefined && gitDiff.length > 0) {
    const diffFile = join(evidencePath, 'git-diff.txt');
    await writeFile(diffFile, sanitizeSecrets(gitDiff), 'utf-8');
    rawFiles.push(diffFile);
  }

  // Optional files changed
  if (filesChanged !== undefined && filesChanged.length > 0) {
    const fcFile = join(evidencePath, 'files-changed.json');
    await writeFile(fcFile, JSON.stringify(filesChanged, null, 2), 'utf-8');
    rawFiles.push(fcFile);
  }

  return {
    runId,
    rawDir: evidencePath,
    rawFiles,
    agentOutput: sanitizeSecrets(agentOutput),
    verifierOutput: sanitizeSecrets(verifierOutput),
  };
}

/**
 * Input shape for claim eligibility check.
 * Compatible with both old and new run report structures.
 */
interface ClaimEligibleInput {
  evidence?: {
    publicClaimEligible?: boolean;
    executionType?: string;
    reproducible?: boolean;
    isolated?: boolean;
  } | null;
  environment?: {
    container?: boolean;
    containerImage?: string;
    containerId?: string;
  } | null;
  usage?: { tokenSource?: string } | null;
  tokens?: { tokenSource?: string } | null;
  driverResult?: { usage?: { tokenSource?: string } | null } | null;
  validation?: { passed?: boolean } | null;
  status?: string;
  results?: {
    acceptanceRate?: number;
    criteria?: Array<{ passed?: boolean }>;
  } | null;
}

/**
 * Determines if a run is eligible for public performance claims.
 *
 * Requirements (all must be true):
 * - `evidence.publicClaimEligible` is true
 * - `evidence.executionType` is "real-execution"
 * - container runs are accepted only with daemon-anchored provenance:
 *   both `environment.containerImage` and `environment.containerId` must be
 *   present (`containerId` is issued by the container runtime, not user
 *   input, so a bare `container:true` flag or a user-typed image alone
 *   is not enough)
 * - isolation must be consistent with containment: `evidence.isolated`
 *   must equal `environment.container === true` (a non-container run
 *   claiming `isolated:true` is rejected as forged)
 * - Token source is "provider-reported" (read from `usage`, `tokens`,
 *   or `driverResult.usage`, in that order)
 * - `evidence.reproducible` is true
 * - `validation.passed` is true
 */
export function isClaimEligibleRun(run: ClaimEligibleInput): boolean {
  if (!run?.evidence?.publicClaimEligible) return false;
  if (run.evidence.executionType !== 'real-execution') return false;
  const container = run.environment?.container === true;
  if (container && (!run.environment?.containerImage || !run.environment?.containerId)) return false;
  if (run.evidence.isolated !== container) return false;
  const tokenSource =
    run.usage?.tokenSource ?? run.tokens?.tokenSource ?? run.driverResult?.usage?.tokenSource;
  if (tokenSource !== 'provider-reported') return false;
  if (run.evidence.reproducible !== true) return false;
  if (run.evidence.isolated !== true) return false;
  if (run.validation?.passed !== true) return false;
  return true;
}

/**
 * Summary of evidence across multiple runs.
 */
interface EvidenceSummary {
  totalRuns: number;
  claimEligibleRuns: number;
  hasMixedEvidence: boolean;
  publicClaimEligible: boolean;
}

/**
 * Summarizes claim eligibility across multiple runs.
 *
 * Returns whether all runs are claim-eligible (no mixed evidence).
 */
export function summarizeEvidence(results: ClaimEligibleInput[]): EvidenceSummary {
  const totalRuns = results.length;
  const claimEligibleRuns = results.filter((r) => isClaimEligibleRun(r)).length;
  const hasMixedEvidence = claimEligibleRuns > 0 && claimEligibleRuns < totalRuns;

  return {
    totalRuns,
    claimEligibleRuns,
    hasMixedEvidence,
    publicClaimEligible: !hasMixedEvidence && claimEligibleRuns > 0,
  };
}
