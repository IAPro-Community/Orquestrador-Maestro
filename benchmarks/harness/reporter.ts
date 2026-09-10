import type { RunResult, ComparisonResult, MannWhitneyResult, WelchTResult } from "./types";

interface ReportOptions {
  repoCommit?: string;
  model?: string;
  driver?: string;
}

interface JsonReport {
  metadata: {
    generatedAt: string;
    repoCommit: string | undefined;
    model: string | undefined;
    driver: string | undefined;
    totalRuns: number;
    claimEligibleRuns: number;
  };
  aggregateSummary: AggregateSummaryRow[];
  comparisons: ComparisonResult[];
  toolUsageSummary: ToolUsageSummaryRow[];
  evidenceGate: {
    totalRuns: number;
    claimEligibleRuns: number;
    hasMixedEvidence: boolean;
    failedRuns: { benchmark: string; condition: string; run: number; errors: string[] }[];
  };
  statisticalSignificance: {
    scenarioId: string;
    mannWhitneyU: MannWhitneyResult | null;
    welchTTest: WelchTResult | null;
    significantByAny: boolean;
  }[];
  results: RunResult[];
}

interface AggregateSummaryRow {
  metric: string;
  vanilla: string;
  maestro: string;
  delta: string;
}

interface ToolUsageSummaryRow {
  metric: string;
  vanilla: string;
  maestro: string;
  delta: string;
  pctChange: string;
}

// --- Formatting helpers ---

function fmtPct(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function fmtNum(value: number | null | undefined, decimals: number = 0): string {
  if (value == null || isNaN(value)) return "N/A";
  if (decimals === 0) return Math.round(value).toLocaleString("en-US");
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPctDelta(pp: number | null | undefined): string {
  if (pp == null || isNaN(pp)) return "N/A";
  const sign = pp > 0 ? "+" : "";
  return `${sign}${pp.toFixed(0)}pp`;
}

function fmtSigLevel(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return "N/A";
  if (p < 0.001) return "p<0.001 ***";
  if (p < 0.01) return `p=${p.toFixed(3)} **`;
  if (p < 0.05) return `p=${p.toFixed(3)} *`;
  return `p=${p.toFixed(3)} ns`;
}

// --- Aggregate summary across all scenarios ---

function buildAggregateSummary(comparisons: ComparisonResult[]): AggregateSummaryRow[] {
  if (comparisons.length === 0) return [];

  const totalV = comparisons.reduce((s, c) => s + c.vanilla.n, 0);
  const totalM = comparisons.reduce((s, c) => s + c.maestro.n, 0);

  const passedV = comparisons.reduce((s, c) => s + Math.round(c.vanilla.successRate * c.vanilla.n), 0);
  const passedM = comparisons.reduce((s, c) => s + Math.round(c.maestro.successRate * c.maestro.n), 0);
  const accV = totalV > 0 ? (passedV / totalV) * 100 : 0;
  const accM = totalM > 0 ? (passedM / totalM) * 100 : 0;

  const medTokensV = median(comparisons.map((c) => c.vanilla.tokens.median).filter((v): v is number => v != null));
  const medTokensM = median(comparisons.map((c) => c.maestro.tokens.median).filter((v): v is number => v != null));
  const medDurV = median(comparisons.map((c) => c.vanilla.duration.median).filter((v): v is number => v != null));
  const medDurM = median(comparisons.map((c) => c.maestro.duration.median).filter((v): v is number => v != null));

  const tputV = medTokensV != null && accV > 0 ? medTokensV / (accV / 100) : null;
  const tputM = medTokensM != null && accM > 0 ? medTokensM / (accM / 100) : null;

  const medCallsV = median(comparisons.map((c) => c.toolUsage?.calls.vanilla).filter((v): v is number => v != null));
  const medCallsM = median(comparisons.map((c) => c.toolUsage?.calls.maestro).filter((v): v is number => v != null));

  return [
    {
      metric: "Acceptance Rate",
      vanilla: `${passedV}/${totalV} (${accV.toFixed(0)}%)`,
      maestro: `${passedM}/${totalM} (${accM.toFixed(0)}%)`,
      delta: fmtPctDelta(accM - accV),
    },
    {
      metric: "Median Tokens",
      vanilla: fmtNum(medTokensV),
      maestro: fmtNum(medTokensM),
      delta: fmtPct(medTokensV != null && medTokensM != null ? ((medTokensM - medTokensV) / medTokensV) * 100 : null),
    },
    {
      metric: "Median Duration",
      vanilla: medDurV != null ? `${fmtNum(medDurV)}s` : "N/A",
      maestro: medDurM != null ? `${fmtNum(medDurM)}s` : "N/A",
      delta: fmtPct(medDurV != null && medDurM != null ? ((medDurM - medDurV) / medDurV) * 100 : null),
    },
    {
      metric: "Tokens/Accepted Task",
      vanilla: fmtNum(tputV),
      maestro: fmtNum(tputM),
      delta: fmtPct(tputV != null && tputM != null ? ((tputM - tputV) / tputV) * 100 : null),
    },
    {
      metric: "Median Tool Calls",
      vanilla: fmtNum(medCallsV),
      maestro: fmtNum(medCallsM),
      delta: fmtPct(medCallsV != null && medCallsM != null ? ((medCallsM - medCallsV) / medCallsV) * 100 : null),
    },
  ];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- Tool usage summary ---

function buildToolUsageSummary(comparisons: ComparisonResult[]): ToolUsageSummaryRow[] {
  if (comparisons.length === 0) return [];

  const avgField = (field: "calls" | "filesRead" | "filesModified" | "filesCreated" | "filesDeleted", cond: "vanilla" | "maestro"): number => {
    const vals = comparisons.map((c) => c.toolUsage?.[field]?.[cond]).filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const pctChange = (v: number, m: number): number | null => v > 0 ? ((m - v) / v) * 100 : null;

  const fields: { key: "calls" | "filesRead" | "filesModified" | "filesCreated" | "filesDeleted"; label: string }[] = [
    { key: "calls", label: "Avg Tool Calls" },
    { key: "filesRead", label: "Avg Files Read" },
    { key: "filesModified", label: "Avg Files Modified" },
    { key: "filesCreated", label: "Avg Files Created" },
    { key: "filesDeleted", label: "Avg Files Deleted" },
  ];

  return fields.map(({ key, label }) => {
    const v = avgField(key, "vanilla");
    const m = avgField(key, "maestro");
    return {
      metric: label,
      vanilla: fmtNum(v, 1),
      maestro: fmtNum(m, 1),
      delta: fmtNum(m - v, 1),
      pctChange: fmtPct(pctChange(v, m)),
    };
  });
}

// --- Evidence gate ---

function buildEvidenceGate(results: RunResult[]): {
  totalRuns: number;
  claimEligibleRuns: number;
  hasMixedEvidence: boolean;
  failedRuns: { benchmark: string; condition: string; run: number; errors: string[] }[];
} {
  const claimEligible = results.filter((r) => r.evidence?.publicClaimEligible).length;
  const failedRuns = results
    .filter((r) => !r.evidence?.passed)
    .map((r) => ({
      benchmark: r.benchmark,
      condition: r.condition,
      run: r.run,
      errors: r.evidence?.errors ?? [],
    }));

  return {
    totalRuns: results.length,
    claimEligibleRuns: claimEligible,
    hasMixedEvidence: claimEligible > 0 && claimEligible < results.length,
    failedRuns,
  };
}

// --- Statistical significance ---

function buildStatisticalSignificance(comparisons: ComparisonResult[]) {
  return comparisons.map((c) => ({
    scenarioId: c.scenarioId,
    mannWhitneyU: c.statisticalTests?.mannWhitneyU ?? null,
    welchTTest: c.statisticalTests?.welchTTest ?? null,
    significantByAny: Boolean(
      c.statisticalTests?.mannWhitneyU?.significant ||
      c.statisticalTests?.welchTTest?.significant
    ),
  }));
}

// --- Mermaid charts ---

function mermaidAcceptanceChart(comparisons: ComparisonResult[]): string {
  const lines = ["```mermaid", "xychart-beta", '  title "Acceptance Rate by Scenario"', '  x-axis ['];
  const labels = comparisons.map((c) => `"${c.scenarioId}"`).join(", ");
  lines.push(`    ${labels}`);
  lines.push("  ]");
  lines.push('  bar [');
  const vals = comparisons.map((c) => (c.vanilla.successRate * 100).toFixed(0)).join(", ");
  lines.push(`    ${vals}`);
  lines.push("  ]");
  lines.push('  bar [');
  const valsM = comparisons.map((c) => (c.maestro.successRate * 100).toFixed(0)).join(", ");
  lines.push(`    ${valsM}`);
  lines.push("  ]");
  lines.push("```");
  return lines.join("\n");
}

function mermaidTokenBoxPlot(comparisons: ComparisonResult[]): string {
  const lines = ["```mermaid", "gantt", '  title Token Usage Distribution (p10-p90)', "  dateFormat  X", "  axisFormat %s"];
  for (const c of comparisons) {
    const vP10 = c.vanilla.tokens.p10 ?? 0;
    const vP90 = c.vanilla.tokens.p90 ?? 0;
    const mP10 = c.maestro.tokens.p10 ?? 0;
    const mP90 = c.maestro.tokens.p90 ?? 0;
    const vMed = c.vanilla.tokens.median ?? 0;
    const mMed = c.maestro.tokens.median ?? 0;
    lines.push(`  section ${c.scenarioId} Vanilla`);
    lines.push(`  p10-p90 : ${Math.round(vP10)}, ${Math.round(vP90)}`);
    lines.push(`  median  : ${Math.round(vMed)}, ${Math.round(vMed)}`);
    lines.push(`  section ${c.scenarioId} Maestro`);
    lines.push(`  p10-p90 : ${Math.round(mP10)}, ${Math.round(mP90)}`);
    lines.push(`  median  : ${Math.round(mMed)}, ${Math.round(mMed)}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function mermaidDurationTimeline(results: RunResult[]): string {
  const lines = ["```mermaid", "gantt", '  title Run Duration Timeline', "  dateFormat  YYYY-MM-DD", "  axisFormat  %H:%M"];

  const byCondition = {
    vanilla: results.filter((r) => r.condition === "vanilla"),
    maestro: results.filter((r) => r.condition === "maestro-core"),
  };

  for (const [cond, runs] of Object.entries(byCondition)) {
    lines.push(`  section ${cond}`);
    for (const r of runs) {
      const dur = r.metadata?.durationMs ?? 0;
      const label = `${r.benchmark} run${r.run}`;
      lines.push(`  ${label} : 0, ${Math.round(dur / 1000)}`);
    }
  }
  lines.push("```");
  return lines.join("\n");
}

// --- Markdown report ---

function generateMarkdownReport(results: RunResult[], comparisons: ComparisonResult[], options: ReportOptions = {}): string {
  const lines: string[] = [];

  lines.push("# Benchmark Report");
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Commit:** ${options.repoCommit || "unknown"}`);
  lines.push(`**Model:** ${options.model || "unknown"}`);
  lines.push(`**Driver:** ${options.driver || "opencode"}`);
  lines.push(`**Scenarios:** ${comparisons.length} | **Total Runs:** ${results.length}`);
  lines.push("");

  // Evidence gate
  const eg = buildEvidenceGate(results);
  lines.push("## Evidence Gate");
  lines.push("");
  lines.push(`- Total runs: ${eg.totalRuns}`);
  lines.push(`- Claim-eligible runs: ${eg.claimEligibleRuns}`);
  lines.push(`- Mixed evidence: ${eg.hasMixedEvidence ? "Yes" : "No"}`);
  if (eg.failedRuns.length > 0) {
    lines.push(`- Failed evidence gate: ${eg.failedRuns.length}`);
    for (const f of eg.failedRuns) {
      lines.push(`  - ${f.benchmark} / ${f.condition} / run ${f.run}: ${f.errors.join("; ")}`);
    }
  }
  lines.push("");

  // Aggregate summary
  lines.push("## Aggregate Summary");
  lines.push("");
  const aggRows = buildAggregateSummary(comparisons);
  if (aggRows.length > 0) {
    lines.push("| Metric | Vanilla | Maestro | Delta |");
    lines.push("|--------|---------|---------|-------|");
    for (const row of aggRows) {
      lines.push(`| ${row.metric} | ${row.vanilla} | ${row.maestro} | ${row.delta} |`);
    }
    lines.push("");
  }

  // Per-scenario breakdowns
  lines.push("## Comparisons");
  lines.push("");
  for (const comp of comparisons) {
    lines.push(`### ${comp.scenarioId}`);
    lines.push("");
    lines.push("| Metric | Vanilla | Maestro | Delta |");
    lines.push("|--------|---------|---------|-------|");
    lines.push(`| Runs (n) | ${comp.vanilla.n} | ${comp.maestro.n} | - |`);
    lines.push(`| Acceptance Rate | ${(comp.vanilla.successRate * 100).toFixed(0)}% | ${(comp.maestro.successRate * 100).toFixed(0)}% | ${fmtPctDelta((comp.maestro.successRate - comp.vanilla.successRate) * 100)} |`);
    lines.push(`| Median Tokens | ${fmtNum(comp.vanilla.tokens.median)} | ${fmtNum(comp.maestro.tokens.median)} | ${fmtPct(comp.delta.tokensMedianPctChange)} |`);
    lines.push(`| Mean Tokens | ${fmtNum(comp.vanilla.tokens.mean)} | ${fmtNum(comp.maestro.tokens.mean)} | ${fmtPct(comp.delta.tokensMeanPctChange)} |`);
    lines.push(`| Median Duration | ${fmtNum(comp.vanilla.duration.median)}s | ${fmtNum(comp.maestro.duration.median)}s | ${fmtPct(comp.delta.durationMedianPctChange)} |`);
    lines.push(`| Mean Duration | ${fmtNum(comp.vanilla.duration.mean)}s | ${fmtNum(comp.maestro.duration.mean)}s | ${fmtPct(comp.delta.durationMeanPctChange)} |`);
    lines.push(`| Stddev Tokens | ${fmtNum(comp.vanilla.tokens.stddev)} | ${fmtNum(comp.maestro.tokens.stddev)} | - |`);
    lines.push(`| Stddev Duration | ${fmtNum(comp.vanilla.duration.stddev)} | ${fmtNum(comp.maestro.duration.stddev)} | - |`);
    lines.push("");

    // Tool usage per scenario
    if (comp.toolUsage) {
      lines.push("**Tool Usage:**");
      lines.push("");
      lines.push("| Tool | Vanilla | Maestro | Delta |");
      lines.push("|------|---------|---------|-------|");
      lines.push(`| Calls | ${fmtNum(comp.toolUsage.calls.vanilla, 1)} | ${fmtNum(comp.toolUsage.calls.maestro, 1)} | ${fmtPct(comp.toolUsage.calls.pctChange)} |`);
      lines.push(`| Files Read | ${fmtNum(comp.toolUsage.filesRead.vanilla, 1)} | ${fmtNum(comp.toolUsage.filesRead.maestro, 1)} | ${fmtPct(comp.toolUsage.filesRead.pctChange)} |`);
      lines.push(`| Files Modified | ${fmtNum(comp.toolUsage.filesModified.vanilla, 1)} | ${fmtNum(comp.toolUsage.filesModified.maestro, 1)} | ${fmtPct(comp.toolUsage.filesModified.pctChange)} |`);
      lines.push(`| Files Created | ${fmtNum(comp.toolUsage.filesCreated.vanilla, 1)} | ${fmtNum(comp.toolUsage.filesCreated.maestro, 1)} | ${fmtPct(comp.toolUsage.filesCreated.pctChange)} |`);
      lines.push(`| Files Deleted | ${fmtNum(comp.toolUsage.filesDeleted.vanilla, 1)} | ${fmtNum(comp.toolUsage.filesDeleted.maestro, 1)} | ${fmtPct(comp.toolUsage.filesDeleted.pctChange)} |`);
      lines.push("");
    }

    if (comp.note) {
      lines.push(`> ${comp.note}`);
      lines.push("");
    }
  }

  // Tool usage analysis
  const toolRows = buildToolUsageSummary(comparisons);
  if (toolRows.length > 0) {
    lines.push("## Tool Usage Analysis");
    lines.push("");
    lines.push("| Metric | Vanilla | Maestro | Delta | % Change |");
    lines.push("|--------|---------|---------|-------|----------|");
    for (const row of toolRows) {
      lines.push(`| ${row.metric} | ${row.vanilla} | ${row.maestro} | ${row.delta} | ${row.pctChange} |`);
    }
    lines.push("");
  }

  // Statistical significance
  const sigResults = buildStatisticalSignificance(comparisons);
  lines.push("## Statistical Significance");
  lines.push("");
  const sigCount = sigResults.filter((s) => s.significantByAny).length;
  lines.push(`**${sigCount} of ${comparisons.length} scenarios show statistically significant differences.**`);
  lines.push("");
  lines.push("| Scenario | Mann-Whitney U | Welch t-test | Significant? |");
  lines.push("|----------|---------------|--------------|--------------|");
  for (const s of sigResults) {
    const mwSig = s.mannWhitneyU ? `${fmtSigLevel(s.mannWhitneyU.p)} (U=${fmtNum(s.mannWhitneyU.u)})` : "N/A (n<5)";
    const welchSig = s.welchTTest ? `${fmtSigLevel(s.welchTTest.p)} (t=${fmtNum(s.welchTTest.t, 2)})` : "N/A";
    lines.push(`| ${s.scenarioId} | ${mwSig} | ${welchSig} | ${s.significantByAny ? "Yes" : "No"} |`);
  }
  lines.push("");

  // Charts
  lines.push("## Charts");
  lines.push("");
  lines.push(mermaidAcceptanceChart(comparisons));
  lines.push("");
  lines.push(mermaidTokenBoxPlot(comparisons));
  lines.push("");
  lines.push(mermaidDurationTimeline(results));
  lines.push("");

  // Run details
  lines.push("## Run Details");
  lines.push("");
  for (const result of results) {
    const mark = result.evidence?.publicClaimEligible ? "+" : "x";
    const totalTests = (result.validation?.testsPassed || 0) + (result.validation?.testsFailed || 0);
    lines.push(`- [${mark}] **${result.benchmark}** / ${result.condition} / run ${result.run}`);
    lines.push(`  - Tokens: ${fmtNum(result.driverResult?.usage?.totalTokens)} | Duration: ${fmtNum(result.metadata?.durationMs)}ms`);
    lines.push(`  - Tests: ${result.validation?.passed ? "PASS" : "FAIL"} (${result.validation?.testsPassed || 0}/${totalTests})`);
    lines.push(`  - Tools: calls=${result.driverResult?.tools?.calls ?? 0}, read=${result.driverResult?.tools?.filesRead ?? 0}, mod=${result.driverResult?.tools?.filesModified ?? 0}, create=${result.driverResult?.tools?.filesCreated ?? 0}, del=${result.driverResult?.tools?.filesDeleted ?? 0}`);
  }

  return lines.join("\n");
}

// --- JSON report ---

function generateJsonReport(results: RunResult[], comparisons: ComparisonResult[], options: ReportOptions = {}): string {
  const eg = buildEvidenceGate(results);
  const sigResults = buildStatisticalSignificance(comparisons);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      repoCommit: options.repoCommit,
      model: options.model,
      driver: options.driver,
      totalRuns: results.length,
      claimEligibleRuns: eg.claimEligibleRuns,
    },
    summary: {
      totalRuns: results.length,
      passedRuns: results.filter((r) => r.evidence?.passed).length,
      failedRuns: results.filter((r) => !r.evidence?.passed).length,
    },
    aggregateSummary: buildAggregateSummary(comparisons),
    comparisons,
    toolUsageSummary: buildToolUsageSummary(comparisons),
    evidenceGate: eg,
    statisticalSignificance: sigResults,
    results,
  };
  return JSON.stringify(report, null, 2);
}

// --- CSV export ---

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateCsvReport(results: RunResult[], comparisons: ComparisonResult[]): string {
  const lines: string[] = [];

  // Header
  lines.push([
    "Scenario",
    "Condition",
    "Run",
    "Tokens",
    "Duration(s)",
    "Passed",
    "TestsPassed",
    "TestsFailed",
    "ToolCalls",
    "FilesRead",
    "FilesModified",
    "FilesCreated",
    "FilesDeleted",
    "ClaimEligible",
  ].map(escapeCsvField).join(","));

  // Data rows
  for (const r of results) {
    lines.push([
      r.benchmark,
      r.condition,
      String(r.run),
      String(r.driverResult?.usage?.totalTokens ?? ""),
      String(r.metadata?.durationMs != null ? (r.metadata.durationMs / 1000).toFixed(1) : ""),
      r.validation?.passed ? "true" : "false",
      String(r.validation?.testsPassed ?? 0),
      String(r.validation?.testsFailed ?? 0),
      String(r.driverResult?.tools?.calls ?? 0),
      String(r.driverResult?.tools?.filesRead ?? 0),
      String(r.driverResult?.tools?.filesModified ?? 0),
      String(r.driverResult?.tools?.filesCreated ?? 0),
      String(r.driverResult?.tools?.filesDeleted ?? 0),
      r.evidence?.publicClaimEligible ? "true" : "false",
    ].map(escapeCsvField).join(","));
  }

  // Comparison rows
  lines.push("");
  lines.push(["# Comparisons", "", "", "", "", "", "", "", "", "", "", "", "", ""].join(","));
  lines.push(["Scenario", "Vanilla Median Tokens", "Maestro Median Tokens", "Tokens Delta%", "Vanilla Median Duration", "Maestro Median Duration", "Duration Delta%", "Success Rate Delta", "MW-U p-value", "Welch p-value"].map(escapeCsvField).join(","));

  for (const c of comparisons) {
    lines.push([
      c.scenarioId,
      String(c.vanilla.tokens.median ?? ""),
      String(c.maestro.tokens.median ?? ""),
      fmtPct(c.delta.tokensMedianPctChange),
      String(c.vanilla.duration.median ?? ""),
      String(c.maestro.duration.median ?? ""),
      fmtPct(c.delta.durationMedianPctChange),
      fmtPctDelta(c.delta.successRateDelta * 100),
      c.statisticalTests?.mannWhitneyU?.p != null ? c.statisticalTests.mannWhitneyU.p.toFixed(4) : "N/A",
      c.statisticalTests?.welchTTest?.p != null ? c.statisticalTests.welchTTest.p.toFixed(4) : "N/A",
    ].map(escapeCsvField).join(","));
  }

  return lines.join("\n");
}

export { generateMarkdownReport, generateJsonReport, generateCsvReport };
