/**
 * Mermaid chart generators for benchmark results.
 * @module reporter/charts
 */

import type { BenchmarkReport } from '../types/report.js';

/**
 * Sanitizes a string for use as a Mermaid node label.
 * Replaces characters that break Mermaid syntax.
 */
function sanitizeLabel(s: string): string {
  return s.replace(/[/()#&;:]/g, '_').replace(/\s+/g, ' ').trim();
}

/**
 * Generates a Mermaid bar chart showing acceptance rate per condition.
 */
export function generateAcceptanceBarChart(report: BenchmarkReport): string {
  const lines: string[] = ['```mermaid', 'xychart-beta', '  title "Acceptance Rate by Condition"'];

  const conditions: string[] = [];
  const values: number[] = [];

  if (report.summary.acceptanceRates.vanilla !== undefined) {
    conditions.push('Vanilla');
    values.push(report.summary.acceptanceRates.vanilla * 100);
  }
  if (report.summary.acceptanceRates.maestro !== undefined) {
    conditions.push('Maestro');
    values.push(report.summary.acceptanceRates.maestro * 100);
  }
  if (report.summary.acceptanceRates.maestroFocus !== undefined) {
    conditions.push('Maestro Focus');
    values.push(report.summary.acceptanceRates.maestroFocus * 100);
  }

  lines.push(`  x-axis [${conditions.map((c) => `"${sanitizeLabel(c)}"`).join(', ')}]`);
  lines.push(`  y-axis "Acceptance Rate (%)" 0 --> 100`);
  lines.push(`  bar [${values.join(', ')}]`);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generates a Mermaid box plot showing token distribution per condition.
 * Uses a bar chart with mean/p25/p75 markers since Mermaid xychart
 * does not natively support box plots.
 */
export function generateTokenBoxPlot(report: BenchmarkReport): string {
  const lines: string[] = ['```mermaid', 'xychart-beta', '  title "Token Distribution per Condition"'];

  const tokens = report.summary.tokensPerAcceptedRun;
  if (!tokens) {
    lines.push('  x-axis ["No Data"]');
    lines.push('  y-axis "Tokens" 0 --> 1');
    lines.push('  bar [0]');
    lines.push('```');
    return lines.join('\n');
  }

  const conditions: string[] = [];
  const means: number[] = [];
  const p25s: number[] = [];
  const p75s: number[] = [];

  if (tokens.vanilla) {
    conditions.push('Vanilla');
    means.push(Math.round(tokens.vanilla.mean));
    p25s.push(Math.round(tokens.vanilla.p25));
    p75s.push(Math.round(tokens.vanilla.p75));
  }
  if (tokens.maestro) {
    conditions.push('Maestro');
    means.push(Math.round(tokens.maestro.mean));
    p25s.push(Math.round(tokens.maestro.p25));
    p75s.push(Math.round(tokens.maestro.p75));
  }
  if (tokens.maestroFocus) {
    conditions.push('Maestro Focus');
    means.push(Math.round(tokens.maestroFocus.mean));
    p25s.push(Math.round(tokens.maestroFocus.p25));
    p75s.push(Math.round(tokens.maestroFocus.p75));
  }

  lines.push(`  x-axis [${conditions.map((c) => `"${sanitizeLabel(c)}"`).join(', ')}]`);
  lines.push(`  y-axis "Tokens" 0 --> ${Math.max(...p75s, 1) * 1.5}`);
  lines.push(`  bar [${means.join(', ')}]`);
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generates a Mermaid timeline showing run durations grouped by scenario.
 */
export function generateDurationTimeline(report: BenchmarkReport): string {
  const lines: string[] = ['```mermaid', 'timeline'];

  lines.push('  title Run Durations');

  const grouped = new Map<string, { vanilla: number[]; maestro: number[] }>();

  for (const pair of report.pairs) {
    const scenarioId = pair.scenarioId ?? 'unknown';
    if (!grouped.has(scenarioId)) {
      grouped.set(scenarioId, { vanilla: [], maestro: [] });
    }
    const entry = grouped.get(scenarioId)!;
    entry.vanilla.push(pair.vanilla.durationMs);
    entry.maestro.push(pair.maestro.durationMs);
  }

  if (grouped.size === 0) {
    lines.push('  No data');
    lines.push('```');
    return lines.join('\n');
  }

  for (const [scenarioId, durations] of grouped) {
    const label = sanitizeLabel(scenarioId);
    lines.push(`  section ${label}`);
    for (const d of durations.vanilla) {
      lines.push(`    Vanilla : ${d}ms`);
    }
    for (const d of durations.maestro) {
      lines.push(`    Maestro : ${d}ms`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}
