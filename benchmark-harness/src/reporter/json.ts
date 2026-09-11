/**
 * JSON report generator for benchmark results.
 * @module reporter/json
 */

import type { BenchmarkReport } from '../types/report.js';

/**
 * Generates a JSON report string from a benchmark report.
 *
 * The output is a pretty-printed JSON string that preserves all fields
 * of the {@link BenchmarkReport} type, including distributions, claims,
 * and paired comparisons.
 */
export function generateJSONReport(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}
