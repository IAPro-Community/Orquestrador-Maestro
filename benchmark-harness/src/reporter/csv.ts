/**
 * CSV report generator for benchmark results.
 * @module reporter/csv
 */

import type { BenchmarkReport } from '../types/report.js';
import type { BenchmarkRunReport } from '../types/run.js';

/** CSV row representing a single run's data. */
interface CsvRow {
  scenario: string;
  condition: string;
  run: string;
  model: string;
  tokens: string;
  duration: string;
  accepted: string;
  evidence_gate: string;
  claim_eligible: string;
}

const CSV_HEADER = 'scenario,condition,run,model,tokens,duration,accepted,evidence_gate,claim_eligible';

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(row: CsvRow): string {
  return [
    escapeCsvField(row.scenario),
    escapeCsvField(row.condition),
    escapeCsvField(row.run),
    escapeCsvField(row.model),
    escapeCsvField(row.tokens),
    escapeCsvField(row.duration),
    escapeCsvField(row.accepted),
    escapeCsvField(row.evidence_gate),
    escapeCsvField(row.claim_eligible),
  ].join(',');
}

function claimEligibleForRow(run: BenchmarkRunReport): string {
  try {
    // 1.1.0: CSV passa a expor elegibilidade de claim (fail-closed: sem evidência = false).
    const evidence = (run as unknown as { evidence?: { publicClaimEligible?: boolean; executionType?: string; reproducible?: boolean; isolated?: boolean } }).evidence;
    const usage = (run as unknown as { usage?: { tokenSource?: string }; tokens?: { source?: string } }).usage
      ?? (run as unknown as { tokens?: { source?: string } }).tokens;
    const validation = (run as unknown as { validation?: { passed?: boolean }; results?: { accepted?: boolean } }).validation;
    if (!evidence || evidence.publicClaimEligible !== true) return "false";
    if (evidence.executionType !== "real-execution") return "false";
    const tokenSource = (usage as { tokenSource?: string } | undefined)?.tokenSource
      ?? (usage as { source?: string } | undefined)?.source;
    if (tokenSource !== "provider-reported") return "false";
    if (evidence.reproducible !== true || evidence.isolated !== true) return "false";
    if (validation && validation.passed !== true) return "false";
    return "true";
  } catch {
    return "false";
  }
}

function runToRow(run: BenchmarkRunReport): CsvRow {
  const accepted = run.results.accepted ?? run.results.acceptanceRate === 1;
  const allPassed = run.results.criteria.every((c) => c.passed);

  return {
    scenario: run.scenarioId,
    condition: run.condition,
    run: run.runId,
    model: run.driver.name,
    tokens: run.tokens.total !== null ? String(run.tokens.total) : '',
    duration: String(run.timing.durationMs),
    accepted: accepted ? 'true' : 'false',
    evidence_gate: allPassed ? 'pass' : 'fail',
    claim_eligible: claimEligibleForRow(run),
  };
}

function pairToRows(pair: BenchmarkReport['pairs'][number]): CsvRow[] {
  const rows: CsvRow[] = [];

  rows.push({
    scenario: pair.scenarioId ?? 'unknown',
    condition: 'vanilla',
    run: pair.vanilla.runId,
    model: '',
    tokens: pair.vanilla.tokens !== null ? String(pair.vanilla.tokens) : '',
    duration: String(pair.vanilla.durationMs),
    accepted: pair.vanilla.accepted ? 'true' : 'false',
    evidence_gate: pair.vanilla.acceptanceRate === 1 ? 'pass' : 'fail',
    claim_eligible: 'false',
  });

  rows.push({
    scenario: pair.scenarioId ?? 'unknown',
    condition: 'maestro',
    run: pair.maestro.runId,
    model: '',
    tokens: pair.maestro.tokens !== null ? String(pair.maestro.tokens) : '',
    duration: String(pair.maestro.durationMs),
    accepted: pair.maestro.accepted ? 'true' : 'false',
    evidence_gate: pair.maestro.acceptanceRate === 1 ? 'pass' : 'fail',
    claim_eligible: 'false',
  });

  if (pair.maestroFocus) {
    rows.push({
      scenario: pair.scenarioId ?? 'unknown',
      condition: 'maestro-focus',
      run: pair.maestroFocus.runId,
      model: '',
      tokens: pair.maestroFocus.tokens !== null ? String(pair.maestroFocus.tokens) : '',
      duration: String(pair.maestroFocus.durationMs),
      accepted: pair.maestroFocus.accepted ? 'true' : 'false',
      evidence_gate: pair.maestroFocus.acceptanceRate === 1 ? 'pass' : 'fail',
      claim_eligible: 'false',
    });
  }

  return rows;
}

/**
 * Generates a CSV report from a benchmark report.
 * Produces one row per run, grouped by scenario and condition.
 */
export function generateCsvReport(report: BenchmarkReport): string {
  const rows: CsvRow[] = [];

  // Use paired comparison data when available
  for (const pair of report.pairs) {
    rows.push(...pairToRows(pair));
  }

  // If no pairs, fall back to scenario-level data
  if (rows.length === 0) {
    for (const scenario of report.scenarios) {
      for (const pair of scenario.pairs) {
        rows.push(...pairToRows(pair));
      }
    }
  }

  const lines = [CSV_HEADER, ...rows.map(rowToCsv)];
  return lines.join('\n');
}
