/**
 * Markdown report generator for benchmark results.
 * @module reporter/markdown
 */

import type {
  BenchmarkReport,
  Distribution,
  PairedComparison,
  BenchmarkClaim,
} from '../types/report.js';
import type { BenchmarkRunReport } from '../types/run.js';
import {
  generateAcceptanceBarChart,
  generateTokenBoxPlot,
  generateDurationTimeline,
} from './charts.js';

/**
 * Formats a number for display in the report.
 */
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return 'N/A';
  return n.toFixed(decimals);
}

/**
 * Formats a distribution as a readable line.
 */
function formatDistribution(d: Distribution, label: string): string {
  if (d.n === 0) return `  - ${label}: no data`;
  const lines = [
    `  - ${label} (n=${d.n}):`,
    `    - mean: ${fmt(d.mean)}`,
    `    - median: ${fmt(d.median)}`,
    `    - stddev: ${fmt(d.stddev)}`,
    `    - p25: ${fmt(d.p25)}, p75: ${fmt(d.p75)}, p90: ${fmt(d.p90)}, p95: ${fmt(d.p95)}`,
  ];
  if (d.ci95Lower !== null && d.ci95Upper !== null) {
    lines.push(`    - CI95: [${fmt(d.ci95Lower)}, ${fmt(d.ci95Upper)}]`);
  } else {
    lines.push(`    - CI95: insufficient data (n < 2)`);
  }
  return lines.join('\n');
}

/**
 * Formats a single paired comparison.
 */
function formatPair(pair: PairedComparison): string {
  const lines: string[] = [
    `### Scenario: ${pair.scenarioId}`,
    '',
    `| Metric | Vanilla | Maestro | Delta |`,
    `|--------|---------|---------|-------|`,
    `| Accepted | ${pair.vanilla.accepted ? 'Yes' : 'No'} | ${pair.maestro.accepted ? 'Yes' : 'No'} | — |`,
    `| Acceptance Rate | ${fmt(pair.vanilla.acceptanceRate, 0)}% | ${fmt(pair.maestro.acceptanceRate, 0)}% | — |`,
    `| Tokens | ${fmt(pair.vanilla.tokens)} | ${fmt(pair.maestro.tokens)} | ${fmt(pair.delta?.tokensAbsolute)} |`,
    `| Duration (ms) | ${fmt(pair.vanilla.durationMs, 0)} | ${fmt(pair.maestro.durationMs, 0)} | ${fmt(pair.delta?.durationAbsolute, 0)} |`,
  ];

  if (pair.delta?.winner) {
    lines.push('', `**Winner: ${pair.delta.winner}**`);
  }

  return lines.join('\n');
}

/**
 * Generates a comprehensive Markdown report from a benchmark report.
 *
 * Structure:
 * 1. Title and metadata
 * 2. Methodology
 * 3. Acceptance Rates (FIRST)
 * 4. Token Metrics
 * 5. Paired Comparisons
 * 6. Statistical Claims
 * 7. Limitations
 */
export function generateMarkdownReport(report: BenchmarkReport): string {
  const sections: string[] = [];

  // Title
  sections.push(`# Benchmark Report: ${report.benchmarkId}`);
  sections.push('');
  if (report.createdAt) {
    sections.push(`**Generated:** ${report.createdAt}`);
  }
  sections.push(`**Version:** ${report.version}`);
  sections.push('');

  // Methodology
  sections.push('## Methodology');
  sections.push('');
  sections.push(report.methodology.description);
  sections.push('');
  if (report.methodology.containerRequired) {
    sections.push('- Container isolation: **required**');
  }
  if (report.methodology.externalVerifier) {
    sections.push('- External verifier: **used**');
  }
  sections.push('');

  // Environment
  if (report.environment) {
    sections.push('## Environment');
    sections.push('');
    if (report.environment.os) sections.push(`- OS: ${report.environment.os}`);
    if (report.environment.arch) sections.push(`- Arch: ${report.environment.arch}`);
    if (report.environment.nodeVersion) sections.push(`- Node: ${report.environment.nodeVersion}`);
    if (report.environment.containerImage) sections.push(`- Container: ${report.environment.containerImage}`);
    sections.push('');
  }

  // Acceptance Rates — FIRST (stored as 0-1 fraction, display as %)
  sections.push('## Acceptance Rates');
  sections.push('');
  if (report.summary.acceptanceRates.vanilla !== undefined) {
    sections.push(`- **Vanilla:** ${(report.summary.acceptanceRates.vanilla * 100).toFixed(1)}%`);
  }
  if (report.summary.acceptanceRates.maestro !== undefined) {
    sections.push(`- **Maestro:** ${(report.summary.acceptanceRates.maestro * 100).toFixed(1)}%`);
  }
  if (report.summary.acceptanceRates.maestroFocus !== undefined) {
    sections.push(`- **Maestro Focus:** ${(report.summary.acceptanceRates.maestroFocus * 100).toFixed(1)}%`);
  }
  sections.push('');

  // Mermaid Charts
  sections.push('## Visualizations');
  sections.push('');
  sections.push(generateAcceptanceBarChart(report));
  sections.push('');
  sections.push(generateTokenBoxPlot(report));
  sections.push('');
  sections.push(generateDurationTimeline(report));
  sections.push('');

  if (report.summary.actionability) {
    sections.push('## Actionability Metrics');
    sections.push('');
    sections.push('| Condition | First action tokens | Next action | State accuracy | Completion evidence | Error actionability |');
    sections.push('|---|---:|---:|---:|---:|---:|');
    for (const [condition, summary] of Object.entries(report.summary.actionability)) {
      sections.push(`| ${condition} | ${fmt(summary.mean.tokensToFirstAction)} | ${(summary.mean.nextActionPresent * 100).toFixed(1)}% | ${(summary.mean.stateAccuracy * 100).toFixed(1)}% | ${(summary.mean.completionEvidencePresent * 100).toFixed(1)}% | ${(summary.mean.errorActionability * 100).toFixed(1)}% |`);
    }
    sections.push('');
  }
  sections.push(`- Total runs: ${report.summary.totalRuns}`);
  sections.push(`  - Vanilla: ${report.summary.vanillaRuns}`);
  sections.push(`  - Maestro: ${report.summary.maestroRuns}`);
  sections.push('');

  // Token Metrics
  sections.push('## Token Metrics');
  sections.push('');
  if (report.summary.tokensPerAcceptedRun) {
    sections.push('### Tokens per Accepted Run');
    sections.push('');
    if (report.summary.tokensPerAcceptedRun.vanilla) {
      sections.push(
        formatDistribution(report.summary.tokensPerAcceptedRun.vanilla, 'Vanilla'),
      );
    }
    if (report.summary.tokensPerAcceptedRun.maestro) {
      sections.push(
        formatDistribution(report.summary.tokensPerAcceptedRun.maestro, 'Maestro'),
      );
    }
    sections.push('');
  }

  if (report.summary.cumulativeTokensToFirstSuccess) {
    sections.push('### Cumulative Tokens to First Success');
    sections.push('');
    if (report.summary.cumulativeTokensToFirstSuccess.vanilla) {
      sections.push(
        formatDistribution(
          report.summary.cumulativeTokensToFirstSuccess.vanilla,
          'Vanilla',
        ),
      );
    }
    if (report.summary.cumulativeTokensToFirstSuccess.maestro) {
      sections.push(
        formatDistribution(
          report.summary.cumulativeTokensToFirstSuccess.maestro,
          'Maestro',
        ),
      );
    }
    sections.push('');
  }

  // Paired Comparisons
  if (report.pairs.length > 0) {
    sections.push('## Paired Comparisons');
    sections.push('');
    for (const pair of report.pairs) {
      sections.push(formatPair(pair));
      sections.push('');
    }
  }

  // Statistical Claims
  if (report.claims && report.claims.length > 0) {
    sections.push('## Statistical Claims');
    sections.push('');
    for (const claim of report.claims) {
      const sig = claim.significant ? '**significant**' : 'not significant';
      const sigLevel = formatSignificanceLevel(claim.pValue);
      sections.push(
        `- ${claim.metric ?? 'unknown'}: vanilla=${claim.vanilla}, maestro=${claim.maestro}, delta=${claim.delta}, p=${fmt(claim.pValue)} ${sigLevel} (${sig})`,
      );
    }
    sections.push('');
  }

  // Limitations
  if (report.limitations && report.limitations.length > 0) {
    sections.push('## Limitations');
    sections.push('');
    for (const lim of report.limitations) {
      sections.push(`- ${lim}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Formats statistical significance level with conventional notation.
 */
function formatSignificanceLevel(pValue: number | null | undefined): string {
  if (pValue === null || pValue === undefined) return '';
  if (pValue < 0.001) return '(p<0.001 ***)';
  if (pValue < 0.01) return `(p=${pValue.toFixed(3)} **)`;
  if (pValue < 0.05) return `(p=${pValue.toFixed(3)} *)`;
  return `(p=${pValue.toFixed(3)} ns)`;
}

/**
 * Generates a ToolUsage comparison table from run reports.
 */
export function formatToolUsageTable(runs: BenchmarkRunReport[]): string {
  const vanillaRuns = runs.filter((r) => r.condition === 'vanilla' && r.toolUsage);
  const maestroRuns = runs.filter((r) => r.condition === 'maestro' && r.toolUsage);

  if (vanillaRuns.length === 0 && maestroRuns.length === 0) {
    return '*No tool usage data available.*\n';
  }

  const avgToolUsage = (toolRuns: BenchmarkRunReport[]) => {
    if (toolRuns.length === 0) return { calls: 0, filesRead: 0, filesModified: 0, filesCreated: 0, filesDeleted: 0 };
    const sums = toolRuns.reduce(
      (acc, r) => ({
        calls: acc.calls + (r.toolUsage?.calls ?? 0),
        filesRead: acc.filesRead + (r.toolUsage?.filesRead ?? 0),
        filesModified: acc.filesModified + (r.toolUsage?.filesModified ?? 0),
        filesCreated: acc.filesCreated + (r.toolUsage?.filesCreated ?? 0),
        filesDeleted: acc.filesDeleted + (r.toolUsage?.filesDeleted ?? 0),
      }),
      { calls: 0, filesRead: 0, filesModified: 0, filesCreated: 0, filesDeleted: 0 },
    );
    const n = toolRuns.length;
    return {
      calls: sums.calls / n,
      filesRead: sums.filesRead / n,
      filesModified: sums.filesModified / n,
      filesCreated: sums.filesCreated / n,
      filesDeleted: sums.filesDeleted / n,
    };
  };

  const v = avgToolUsage(vanillaRuns);
  const m = avgToolUsage(maestroRuns);

  const fmtDelta = (a: number, b: number) => {
    const delta = b - a;
    const pct = a !== 0 ? ((delta / a) * 100).toFixed(1) : 'N/A';
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(0)} (${pct}%)`;
  };

  return [
    '| Metric | Vanilla | Maestro | Delta |',
    '|--------|---------|---------|-------|',
    `| Tool Calls | ${v.calls.toFixed(1)} | ${m.calls.toFixed(1)} | ${fmtDelta(v.calls, m.calls)} |`,
    `| Files Read | ${v.filesRead.toFixed(1)} | ${m.filesRead.toFixed(1)} | ${fmtDelta(v.filesRead, m.filesRead)} |`,
    `| Files Modified | ${v.filesModified.toFixed(1)} | ${m.filesModified.toFixed(1)} | ${fmtDelta(v.filesModified, m.filesModified)} |`,
    `| Files Created | ${v.filesCreated.toFixed(1)} | ${m.filesCreated.toFixed(1)} | ${fmtDelta(v.filesCreated, m.filesCreated)} |`,
    `| Files Deleted | ${v.filesDeleted.toFixed(1)} | ${m.filesDeleted.toFixed(1)} | ${fmtDelta(v.filesDeleted, m.filesDeleted)} |`,
    '',
  ].join('\n');
}
