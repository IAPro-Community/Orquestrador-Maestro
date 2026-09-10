/**
 * Run report types — one report per individual scenario execution.
 * @module run
 */

import type { TokenUsage } from './tokens.js';

/** Outcome of a single benchmark run. */
export type RunStatus =
  | 'passed'
  | 'failed'
  | 'timeout'
  | 'error'
  | 'skipped'
  | 'benchmark-integrity-violation';

/** Experimental condition under which the run was executed. */
export type Condition = 'vanilla' | 'maestro' | 'maestro-focus';

/** Driver identity recorded in the run report. */
export interface RunDriver {
  /** Driver implementation name (e.g. `'opencode'`, `'claude'`). */
  name: string;
  /** Driver version string. */
  version: string;
  /** Free-form driver-specific configuration snapshot. */
  config?: Record<string, unknown>;
}

/** Fixture reference within a run report. */
export interface RunFixture {
  /** Relative path to the fixture directory used. */
  path: string;
  /** SHA-256 hash of fixture contents at run time. */
  hash: string;
}

/** Execution environment snapshot. */
export interface RunEnvironment {
  /** Operating system (e.g. `'linux'`). */
  os?: string;
  /** CPU architecture (e.g. `'x86_64'`). */
  arch?: string;
  /** Whether execution ran inside a container. */
  container?: boolean;
  /** Container image tag, if applicable. */
  containerImage?: string;
  /** Node.js version. */
  nodeVersion?: string;
  /** Whether the run was isolated from external state. */
  isolated?: boolean;
}

/** Result of a single acceptance criterion evaluation. */
export interface CriterionResult {
  /** Criterion type discriminator. */
  type: string;
  /** Criterion name. */
  name: string;
  /** Whether this criterion passed. */
  passed: boolean;
  /** Wall-clock duration in milliseconds. */
  duration?: number;
  /** Captured stdout / stderr output. */
  output?: string;
  /** Error message if the criterion failed. */
  error?: string;
}

/** Aggregated acceptance results for the run. */
export interface RunResults {
  /** Fraction of criteria that passed (0–1). */
  acceptanceRate: number;
  /** Convenience boolean: `acceptanceRate === 1`. */
  accepted?: boolean;
  /** Per-criterion results in evaluation order. */
  criteria: CriterionResult[];
}

/** Wall-clock timing of the agent execution. */
export interface RunTiming {
  /** Epoch milliseconds when the run started. */
  startMs: number;
  /** Epoch milliseconds when the run ended. */
  endMs: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

/** Evidence artifacts produced during the run. */
export interface RunEvidence {
  /** Directory containing all raw evidence files. */
  rawDir: string;
  /** Full agent output (stdout + stderr). */
  agentOutput: string;
  /** Verifier output (stdout + stderr). */
  verifierOutput: string;
  /** Agent process exit code. */
  agentExitCode?: number;
  /** Verifier process exit code. */
  verifierExitCode?: number;
  /** Files created or modified by the agent. */
  filesChanged?: string[];
  /** Git diff of the workspace after the run. */
  gitDiff?: string;
  /** Path to the agent session file. */
  sessionFile?: string;
}

/** Complete report for a single benchmark run. */
export interface BenchmarkRunReport {
  /** Unique run identifier (UUID). */
  runId: string;
  /** Scenario this run executed. */
  scenarioId: string;
  /** Experimental condition. */
  condition: Condition;
  /** Driver that performed the execution. */
  driver: RunDriver;
  /** Fixture snapshot at run time. */
  fixture: RunFixture;
  /** SHA-256 of the task prompt. */
  taskHash?: string;
  /** Execution environment. */
  environment?: RunEnvironment;
  /** Outcome of the run. */
  status: RunStatus;
  /** Classification of the failure (when status is failed / error / integrity-violation). */
  failureType?: string;
  /** Acceptance results. */
  results: RunResults;
  /** Token usage. */
  tokens: TokenUsage;
  /** Tool usage statistics (null if unavailable). */
  toolUsage?: import('../types/driver.js').ToolUsage | null;
  /** Wall-clock timing. */
  timing: RunTiming;
  /** Evidence artifacts. */
  evidence: RunEvidence;
  /** ISO-8601 timestamp of when the report was created. */
  createdAt: string;
}
