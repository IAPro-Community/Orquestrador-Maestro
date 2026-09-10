import type {
  RunResult,
  AggregatedMetrics,
  ComparisonResult,
  StatisticalSummary,
  MannWhitneyResult,
  WelchTResult,
  OutlierResult,
  ToolUsageComparison,
  StatisticalTestResult,
} from "./types";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values)!;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function confidenceInterval95(values: number[]): { lower: number | null; upper: number | null } {
  if (values.length < 2) return { lower: null, upper: null };
  const m = mean(values)!;
  const s = stddev(values)!;
  const n = values.length;
  const margin = (1.96 * s) / Math.sqrt(n);
  return { lower: m - margin, upper: m + margin };
}

function min(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.min(...values);
}

function max(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

function aggregateStatisticalSummary(values: number[]): StatisticalSummary {
  return {
    median: median(values),
    mean: mean(values),
    p10: percentile(values, 10),
    p25: percentile(values, 25),
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    min: min(values),
    max: max(values),
    ci95: confidenceInterval95(values),
    stddev: stddev(values),
  };
}

function aggregateResults(results: RunResult[]): AggregatedMetrics {
  const tokens = results
    .map((r) => r.driverResult?.usage?.totalTokens)
    .filter((t): t is number => t != null);
  const durations = results
    .map((r) => r.metadata?.durationMs)
    .filter((d): d is number => d != null);
  const successCount = results.filter((r) => r.validation?.passed).length;

  return {
    n: results.length,
    successRate: results.length > 0 ? successCount / results.length : 0,
    tokens: aggregateStatisticalSummary(tokens),
    duration: aggregateStatisticalSummary(durations),
  };
}

function aggregateToolUsage(results: RunResult[]): ToolUsageComparison {
  const vanilla = results.filter((r) => r.condition === "vanilla");
  const maestro = results.filter((r) => r.condition === "maestro-core");

  const avgCalls = (rs: RunResult[]) => {
    const calls = rs.map((r) => r.driverResult?.tools?.calls ?? 0);
    return calls.length > 0 ? calls.reduce((a, b) => a + b, 0) / calls.length : 0;
  };
  const avgReads = (rs: RunResult[]) => {
    const v = rs.map((r) => r.driverResult?.tools?.filesRead ?? 0);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const avgModified = (rs: RunResult[]) => {
    const v = rs.map((r) => r.driverResult?.tools?.filesModified ?? 0);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const avgCreated = (rs: RunResult[]) => {
    const v = rs.map((r) => r.driverResult?.tools?.filesCreated ?? 0);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const avgDeleted = (rs: RunResult[]) => {
    const v = rs.map((r) => r.driverResult?.tools?.filesDeleted ?? 0);
    return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };

  const deltaPct = (v: number, m: number): number | null => v > 0 ? ((m - v) / v) * 100 : null;

  const vCalls = avgCalls(vanilla);
  const mCalls = avgCalls(maestro);
  const vReads = avgReads(vanilla);
  const mReads = avgReads(maestro);
  const vMod = avgModified(vanilla);
  const mMod = avgModified(maestro);
  const vCre = avgCreated(vanilla);
  const mCre = avgCreated(maestro);
  const vDel = avgDeleted(vanilla);
  const mDel = avgDeleted(maestro);

  return {
    calls: { vanilla: vCalls, maestro: mCalls, delta: mCalls - vCalls, pctChange: deltaPct(vCalls, mCalls) },
    filesRead: { vanilla: vReads, maestro: mReads, delta: mReads - vReads, pctChange: deltaPct(vReads, mReads) },
    filesModified: { vanilla: vMod, maestro: mMod, delta: mMod - vMod, pctChange: deltaPct(vMod, mMod) },
    filesCreated: { vanilla: vCre, maestro: mCre, delta: mCre - vCre, pctChange: deltaPct(vCre, mCre) },
    filesDeleted: { vanilla: vDel, maestro: mDel, delta: mDel - vDel, pctChange: deltaPct(vDel, mDel) },
  };
}

// --- Normal CDF approximation (Abramowitz & Stegun) ---

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

// --- Student's t-distribution ---

function gammaLn(x: number): number {
  const c = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5,
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += c[j] / ++y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function tCDF(t: number, df: number): number {
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  const ibeta = betaIncomplete(a, b, x);
  return t >= 0 ? 1 - 0.5 * ibeta : 0.5 * ibeta;
}

function betaIncomplete(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return NaN;
  if (x === 0 || x === 1) return x;

  const lbeta = gammaLn(a + b) - gammaLn(a) - gammaLn(b) +
    a * Math.log(x) + b * Math.log(1 - x);

  if (x < (a + 1) / (a + b + 2)) {
    return Math.exp(lbeta) * betaCF(a, b, x) / a;
  } else {
    return 1 - Math.exp(lbeta) * betaCF(b, a, 1 - x) / b;
  }
}

function betaCF(a: number, b: number, x: number): number {
  const maxIter = 200;
  const eps = 3e-7;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

// --- Welch's t-test ---

function welchTTest(x: number[], y: number[], alpha: number = 0.05): WelchTResult {
  const n1 = x.length;
  const n2 = y.length;

  if (n1 < 2 || n2 < 2) {
    return { t: NaN, df: NaN, p: NaN, significant: false, n1, n2, alpha };
  }

  const m1 = mean(x)!;
  const m2 = mean(y)!;
  const s1 = stddev(x)!;
  const s2 = stddev(y)!;

  const se = Math.sqrt((s1 * s1) / n1 + (s2 * s2) / n2);
  if (se === 0) {
    return { t: 0, df: n1 + n2 - 2, p: 1, significant: false, n1, n2, alpha };
  }

  const t = (m1 - m2) / se;

  const num = ((s1 * s1) / n1 + (s2 * s2) / n2) ** 2;
  const den = ((s1 * s1) / n1) ** 2 / (n1 - 1) + ((s2 * s2) / n2) ** 2 / (n2 - 1);
  const df = num / den;

  const p = 2 * (1 - tCDF(Math.abs(t), df));

  return { t, df, p, significant: p < alpha, n1, n2, alpha };
}

// --- Mann-Whitney U test ---

function mannWhitneyU(x: number[], y: number[], alpha: number = 0.05): MannWhitneyResult {
  const n1 = x.length;
  const n2 = y.length;

  if (n1 < 5 || n2 < 5) {
    return { u: NaN, p: NaN, significant: false, n1, n2, alpha };
  }

  const combined = [
    ...x.map((v) => ({ v, group: 0 })),
    ...y.map((v) => ({ v, group: 1 })),
  ];
  combined.sort((a, b) => a.v - b.v);

  const ranks = new Array(combined.length);
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].v === combined[i].v) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[k] = avgRank;
    }
    i = j;
  }

  let r1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 0) {
      r1 += ranks[k];
    }
  }

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  const muU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigmaU > 0 ? (u - muU) / sigmaU : 0;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return { u, p, significant: p < alpha, n1, n2, alpha };
}

// --- Outlier detection (IQR method) ---

function detectOutliers(values: number[]): OutlierResult {
  if (values.length === 0) {
    return { values: [], outliers: [], method: "IQR", lowerBound: NaN, upperBound: NaN };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(values, 25)!;
  const q3 = percentile(values, 75)!;
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = sorted.filter((v) => v < lowerBound || v > upperBound);

  return {
    values: sorted,
    outliers,
    method: "IQR",
    lowerBound,
    upperBound,
  };
}

function trimOutliers(values: number[], percentage: number = 0.1): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * percentage);
  if (trimCount === 0) return sorted;
  return sorted.slice(trimCount, sorted.length - trimCount);
}

// --- Enhanced compareConditions ---

function computePctChange(v: number, m: number): number | null {
  return v !== 0 ? ((m - v) / v) * 100 : null;
}

function compareConditions(vanillaResults: RunResult[], maestroResults: RunResult[]): Omit<ComparisonResult, "scenarioId"> {
  const v = aggregateResults(vanillaResults);
  const m = aggregateResults(maestroResults);

  const tokenTests = computeStatisticalTests(vanillaResults, maestroResults, "tokens");
  const durationTests = computeStatisticalTests(vanillaResults, maestroResults, "duration");

  const tokensV = vanillaResults.map((r) => r.driverResult?.usage?.totalTokens).filter((t): t is number => t != null);
  const tokensM = maestroResults.map((r) => r.driverResult?.usage?.totalTokens).filter((t): t is number => t != null);
  const durV = vanillaResults.map((r) => r.metadata?.durationMs).filter((d): d is number => d != null);
  const durM = maestroResults.map((r) => r.metadata?.durationMs).filter((d): d is number => d != null);

  const outlierTokens = tokensV.length >= 3 && tokensM.length >= 3
    ? { tokens: detectOutliers([...tokensV, ...tokensM]), duration: detectOutliers([...durV, ...durM]) }
    : null;

  let toolUsage: ToolUsageComparison | null = null;
  if (vanillaResults.length > 0 && maestroResults.length > 0) {
    const allResults = [...vanillaResults, ...maestroResults];
    toolUsage = aggregateToolUsage(allResults);
  }

  return {
    vanilla: v,
    maestro: m,
    delta: {
      tokensMedianDelta: m.tokens.median != null && v.tokens.median != null
        ? m.tokens.median - v.tokens.median : null,
      tokensMedianPctChange: m.tokens.median != null && v.tokens.median != null
        ? computePctChange(v.tokens.median, m.tokens.median) : null,
      tokensMeanDelta: m.tokens.mean != null && v.tokens.mean != null
        ? m.tokens.mean - v.tokens.mean : null,
      tokensMeanPctChange: m.tokens.mean != null && v.tokens.mean != null
        ? computePctChange(v.tokens.mean, m.tokens.mean) : null,
      durationMedianDelta: m.duration.median != null && v.duration.median != null
        ? m.duration.median - v.duration.median : null,
      durationMedianPctChange: m.duration.median != null && v.duration.median != null
        ? computePctChange(v.duration.median, m.duration.median) : null,
      durationMeanDelta: m.duration.mean != null && v.duration.mean != null
        ? m.duration.mean - v.duration.mean : null,
      durationMeanPctChange: m.duration.mean != null && v.duration.mean != null
        ? computePctChange(v.duration.mean, m.duration.mean) : null,
      successRateDelta: m.successRate - v.successRate,
    },
    statisticalTests: {
      mannWhitneyU: tokenTests.mannWhitneyU,
      welchTTest: tokenTests.welchTTest,
    },
    outlierDetection: outlierTokens,
    toolUsage,
    note: v.n < 3 || m.n < 3
      ? "Insufficient runs for statistical significance (need >=3 per condition)"
      : v.n < 5 || m.n < 5
        ? "Small sample size; parametric tests may have limited power (need >=5 per condition for non-parametric tests)"
        : "Adequate sample size for directional comparison",
  };
}

function computeStatisticalTests(
  vanillaResults: RunResult[],
  maestroResults: RunResult[],
  metric: "tokens" | "duration",
): { mannWhitneyU: MannWhitneyResult | null; welchTTest: WelchTResult | null } {
  const extractValues = (results: RunResult[]): number[] => {
    if (metric === "tokens") {
      return results.map((r) => r.driverResult?.usage?.totalTokens).filter((t): t is number => t != null);
    }
    return results.map((r) => r.metadata?.durationMs).filter((d): d is number => d != null);
  };

  const x = extractValues(vanillaResults);
  const y = extractValues(maestroResults);

  if (x.length < 2 || y.length < 2) {
    return { mannWhitneyU: null, welchTTest: null };
  }

  const welch = welchTTest(x, y);
  const mw = x.length >= 5 && y.length >= 5 ? mannWhitneyU(x, y) : null;

  return { mannWhitneyU: mw, welchTTest: welch };
}

export {
  median,
  percentile,
  mean,
  stddev,
  confidenceInterval95,
  min,
  max,
  aggregateResults,
  aggregateToolUsage,
  compareConditions,
  mannWhitneyU,
  welchTTest,
  detectOutliers,
  trimOutliers,
  normalCDF,
  tCDF,
};
