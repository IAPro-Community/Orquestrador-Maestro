/**
 * Final benchmark report types — paired comparison across conditions.
 * @module report
 */

import type { Condition } from './run.js';
import type { ActionabilitySummary } from './metrics.js';

/** Winner of a paired comparison. */
export type PairWinner = 'vanilla' | 'maestro' | 'tie';

/** Distribution summary for a numeric metric. */
export interface Distribution {
  /** Sample count. */
  n: number;
  /** Arithmetic mean. */
  mean: number;
  /** Median (50th percentile). */
  median: number;
  /** Standard deviation. */
  stddev: number;
  /** 25th percentile. */
  p25: number;
  /** 75th percentile. */
  p75: number;
  /** 90th percentile. */
  p90: number;
  /** 95th percentile. */
  p95: number;
  /** 95% confidence interval lower bound (may be null for small n). */
  ci95Lower: number | null;
  /** 95% confidence interval upper bound (may be null for small n). */
  ci95Upper: number | null;
}

/** Summary of one run within a paired comparison. */
export interface RunSummary {
  /** Run identifier. */
  runId: string;
  /** Outcome status. */
  status: string;
  /** Whether all acceptance criteria passed. */
  accepted: boolean;
  /** Total tokens consumed (null if unavailable). */
  tokens: number | null;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Acceptance rate (0–1). */
  acceptanceRate: number;
}

/** Delta between a vanilla and maestro run of the same scenario. */
export interface PairDelta {
  /** Absolute token difference (vanilla − maestro). */
  tokensAbsolute: number | null;
  /** Relative token difference as a fraction (vanilla − maestro) / vanilla. */
  tokensRelative: number | null;
  /** Absolute duration difference in milliseconds. */
  durationAbsolute: number;
  /** Relative duration difference as a fraction. */
  durationRelative: number;
  /** Which condition performed better. */
  winner: PairWinner;
}

/** Paired comparison of a vanilla and maestro run for one scenario. */
export interface PairedComparison {
  /** Unique pair identifier. */
  pairId: string;
  /** Scenario these runs executed. */
  scenarioId?: string;
  /** Fixture hash for deterministic matching. */
  fixtureHash?: string;
  /** Task prompt hash. */
  taskHash?: string;
  /** Model used. */
  model?: string;
  /** Vanilla (baseline) run summary. */
  vanilla: RunSummary;
  /** Maestro (treatment) run summary. */
  maestro: RunSummary;
  /** Computed delta between the two runs. */
  delta?: PairDelta;
}

/** Methodology description for the benchmark. */
export interface BenchmarkMethodology {
  /** Human-readable methodology description. */
  description: string;
  /** Whether container isolation was required. */
  containerRequired: boolean;
  /** Whether an external verifier was used. */
  externalVerifier: boolean;
  /** Whether each run was isolated. */
  isolatedRuns?: boolean;
  /** Whether golden fixtures were used. */
  goldenFixture?: boolean;
}

/** Environment snapshot at benchmark execution time. */
export interface BenchmarkEnvironment {
  /** Operating system. */
  os?: string;
  /** CPU architecture. */
  arch?: string;
  /** Container image used. */
  containerImage?: string;
  /** Node.js version. */
  nodeVersion?: string;
  /** Provider / driver version map. */
  providerVersions?: Record<string, string>;
}

/** A statistical claim produced by the benchmark. */
export interface BenchmarkClaim {
  /** Metric name (e.g. `'tokensPerAcceptedRun'`). */
  metric?: string;
  /** Vanilla value. */
  vanilla?: unknown;
  /** Maestro value. */
  maestro?: unknown;
  /** Absolute delta (vanilla − maestro). */
  delta?: unknown;
  /** Relative delta as a fraction. */
  deltaPercent?: unknown;
  /** P-value from the significance test. */
  pValue?: number;
  /** Whether the result is statistically significant. */
  significant?: boolean;
}

/** Scenario-level summary within the final report. */
export interface ReportScenario {
  /** Scenario identifier. */
  id: string;
  /** Scenario name. */
  name: string;
  /** Paired comparisons for this scenario. */
  pairs: PairedComparison[];
}

/** Aggregate summary statistics across all scenarios. */
export interface BenchmarkSummary {
  /** Total number of individual runs. */
  totalRuns: number;
  /** Number of vanilla (baseline) runs. */
  vanillaRuns: number;
  /** Number of maestro (treatment) runs. */
  maestroRuns: number;
  /** Number of Maestro focus runs. */
  maestroFocusRuns?: number;
  /** Acceptance rates by condition. */
  acceptanceRates: {
    vanilla?: number;
    maestro?: number;
    maestroFocus?: number;
  };
  /** Token distribution for accepted runs, by condition. */
  tokensPerAcceptedRun?: {
    vanilla?: Distribution;
    maestro?: Distribution;
    maestroFocus?: Distribution;
  };
  /** Cumulative tokens to first success, by condition. */
  cumulativeTokensToFirstSuccess?: {
    vanilla?: Distribution;
    maestro?: Distribution;
    maestroFocus?: Distribution;
  };
  /** Deterministic actionability metrics grouped by condition. */
  actionability?: Partial<Record<Condition, ActionabilitySummary>>;
}

/** Final benchmark report with paired comparison statistics. */
export interface BenchmarkReport {
  /** Unique benchmark run identifier. */
  benchmarkId: string;
  /** Report format version (always `'2'`). */
  version: '2';
  /** ISO-8601 timestamp of report creation. */
  createdAt?: string;
  /** Methodology description. */
  methodology: BenchmarkMethodology;
  /** Execution environment snapshot. */
  environment?: BenchmarkEnvironment;
  /** Per-scenario summaries with paired comparisons. */
  scenarios: ReportScenario[];
  /** Flattened list of all paired comparisons. */
  pairs: PairedComparison[];
  /** Aggregate summary statistics. */
  summary: BenchmarkSummary;
  /** Statistical claims derived from the data. */
  claims?: BenchmarkClaim[];
  /** Known limitations of this benchmark run. */
  limitations?: string[];
  /** Path to the raw evidence directory. */
  rawEvidencePath?: string;
}

/**
 * A matched pair of vanilla and maestro runs for the same scenario.
 * Used as input to paired comparison analysis.
 */
export interface PairedRun {
  /** Scenario identifier shared by both runs. */
  scenarioId: string;
  /** Vanilla (baseline) run report. */
  vanilla: import('./run.js').BenchmarkRunReport;
  /** Maestro (treatment) run report. */
  maestro: import('./run.js').BenchmarkRunReport;
}

/** Result of a paired comparison across all scenarios. */
export interface ComparisonResult {
  /** Distribution summary for vanilla token-per-accepted-run. */
  vanillaDistribution: Distribution;
  /** Distribution summary for maestro token-per-accepted-run. */
  maestroDistribution: Distribution;
  /** Absolute delta in mean tokens per accepted run (vanilla − maestro). */
  deltaMeanTokens: number | null;
  /** Relative delta as a fraction (vanilla − maestro) / vanilla. */
  deltaRelativeTokens: number | null;
  /** Which condition is the winner. */
  winner: 'vanilla' | 'maestro' | 'tie';
  /** p-value from Welch's t-test on tokens per accepted run. */
  pValue: number | null;
  /** Whether the difference is statistically significant (p < 0.05). */
  significant: boolean;
  /** Number of pairs compared. */
  pairCount: number;
}
