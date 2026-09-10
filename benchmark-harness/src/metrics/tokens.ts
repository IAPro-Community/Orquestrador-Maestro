/**
 * Token usage tracking and aggregation.
 * @module metrics/tokens
 */

import type { BenchmarkRunReport } from '../types/run.js';

/** Aggregate token summary across multiple runs. */
export interface TokenSummary {
  /** Total tokens consumed across all runs. */
  total: number;
  /** Per-run total token consumption. */
  perRun: number[];
  /** Total tokens consumed by accepted runs only. */
  accepted: number;
  /** Total tokens consumed by failed runs only. */
  failed: number;
  /** Per-run totals for accepted runs only. */
  perAcceptedRun: number[];
}

/**
 * Extract the total token count from a single run report.
 * Returns `null` when token data is unavailable.
 */
function totalTokens(run: BenchmarkRunReport): number | null {
  return run.tokens.total;
}

/**
 * Sums token usage across multiple run reports.
 *
 * Returns a {@link TokenSummary} with aggregate and per-run breakdowns.
 * Runs with unavailable token data (`null` total) are excluded from sums
 * but included as `null` entries in per-run arrays.
 */
export function sumTokenUsage(runs: BenchmarkRunReport[]): TokenSummary {
  const perRun: (number | null)[] = [];
  const perAcceptedRun: number[] = [];
  let total = 0;
  let accepted = 0;
  let failed = 0;

  for (const run of runs) {
    const t = totalTokens(run);
    perRun.push(t);

    if (t !== null) {
      total += t;
      if (run.results.accepted === true) {
        accepted += t;
        perAcceptedRun.push(t);
      } else {
        failed += t;
      }
    }
  }

  return {
    total,
    perRun: perRun as number[],
    accepted,
    failed,
    perAcceptedRun,
  };
}

/**
 * Computes cumulative tokens consumed until the first accepted run
 * for a sequence of runs in execution order.
 *
 * @returns Cumulative token count, or `null` if no run was accepted.
 */
export function cumulativeTokensToFirstSuccess(
  runs: BenchmarkRunReport[],
): number | null {
  let cumulative = 0;

  for (const run of runs) {
    const t = totalTokens(run);
    if (t !== null) {
      cumulative += t;
    }
    if (run.results.accepted === true) {
      return cumulative;
    }
  }

  return null;
}
