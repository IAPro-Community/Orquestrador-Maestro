/**
 * Statistical calculations for benchmark metrics.
 * @module metrics/statistics
 */

import type { Distribution } from '../types/report.js';

/**
 * Sorts a numeric array in ascending order (mutates a copy).
 */
function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Computes the p-th percentile of a sorted array using linear interpolation.
 */
function percentile(sortedVals: number[], p: number): number {
  if (sortedVals.length === 0) return 0;
  if (sortedVals.length === 1) return sortedVals[0];

  const index = (p / 100) * (sortedVals.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sortedVals[lower];

  const fraction = index - lower;
  return sortedVals[lower] + fraction * (sortedVals[upper] - sortedVals[lower]);
}

/**
 * Computes the arithmetic mean of a numeric array.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Computes the sample standard deviation (Bessel's correction).
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sumSq = 0;
  for (const v of values) {
    const diff = v - m;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Computes a full distribution summary for a numeric array.
 *
 * All percentiles use linear interpolation on the sorted values.
 * Standard deviation uses Bessel's correction (n-1 denominator).
 * CI95 is `null` when n < 2.
 *
 * @returns Distribution summary.
 */
export function computeDistribution(values: number[]): Distribution {
  if (values.length === 0) {
    return {
      n: 0,
      mean: 0,
      median: 0,
      stddev: 0,
      p25: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      ci95Lower: null,
      ci95Upper: null,
    };
  }

  const s = sorted(values);
  const m = mean(s);
  const sd = stddev(s);
  const n = s.length;
  const se = n >= 2 ? sd / Math.sqrt(n) : 0;

  // CI95: mean ± t * SE (t = 1.96 for large n; for small n we use 1.96 as approximation)
  // Returns null when n < 2
  const ci95Lower = n >= 2 ? m - 1.96 * se : null;
  const ci95Upper = n >= 2 ? m + 1.96 * se : null;

  return {
    n,
    mean: m,
    median: percentile(s, 50),
    stddev: sd,
    p25: percentile(s, 25),
    p75: percentile(s, 75),
    p90: percentile(s, 90),
    p95: percentile(s, 95),
    ci95Lower,
    ci95Upper,
  };
}

/**
 * Welch's t-test for independent samples (does not assume equal variance).
 *
 * Works with small sample sizes (n < 10). Returns a two-tailed p-value
 * approximation using the t-distribution with Welch–Satterthwaite degrees
 * of freedom.
 *
 * When either sample has n < 2, returns `{ tStatistic: 0, pValue: 1, significant: false }`.
 */
export function welchTTest(
  vanilla: number[],
  maestro: number[],
): { tStatistic: number; pValue: number; significant: boolean } {
  if (vanilla.length < 2 || maestro.length < 2) {
    return { tStatistic: 0, pValue: 1, significant: false };
  }

  const meanV = mean(vanilla);
  const meanM = mean(maestro);
  const sdV = stddev(vanilla);
  const sdM = stddev(maestro);
  const nV = vanilla.length;
  const nM = maestro.length;

  const seV = (sdV * sdV) / nV;
  const seM = (sdM * sdM) / nM;
  const se = Math.sqrt(seV + seM);

  if (se === 0) {
    return { tStatistic: 0, pValue: 1, significant: false };
  }

  const tStatistic = (meanV - meanM) / se;

  // Welch–Satterthwaite degrees of freedom
  const num = (seV + seM) * (seV + seM);
  const den =
    (seV * seV) / (nV - 1) + (seM * seM) / (nM - 1);
  const df = den > 0 ? num / den : 1;

  // Two-tailed p-value approximation using regularized incomplete beta function
  const pValue = twoTailedPValue(Math.abs(tStatistic), df);

  return {
    tStatistic,
    pValue,
    significant: pValue < 0.05,
  };
}

/**
 * Approximates the two-tailed p-value for a t-statistic with `df` degrees
 * of freedom using the incomplete beta function.
 */
function twoTailedPValue(t: number, df: number): number {
  const x = df / (df + t * t);
  const p = regularizedIncompleteBeta(df / 2, 0.5, x);
  return Math.min(1, Math.max(0, p));
}

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction
 * expansion (Lentz's method). Good enough for p-value approximations.
 */
function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use symmetry relation when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(b, a, 1 - x);
  }

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lnBeta,
  ) / a;

  // Continued fraction
  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= 200; i++) {
    const m = i;
    const an = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= c * d;

    const an2 =
      -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + an2 * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + an2 / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < 1e-8) break;
  }

  return front * f;
}

/**
 * Stirling's approximation for ln(gamma(x)).
 * Accurate enough for the degrees of freedom we encounter.
 */
function lnGamma(x: number): number {
  if (x <= 0) return 0;

  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
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

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Mann-Whitney U test (non-parametric, does not assume normality).
 *
 * Requires n >= 5 per group. Returns U statistic, two-tailed p-value
 * via normal approximation, and significance at the given alpha level.
 */
export function mannWhitneyU(
  x: number[],
  y: number[],
  alpha = 0.05,
): { u: number; p: number; significant: boolean; n1: number; n2: number; alpha: number } {
  const n1 = x.length;
  const n2 = y.length;

  if (n1 < 5 || n2 < 5) {
    return { u: NaN, p: NaN, significant: false, n1, n2, alpha };
  }

  // Combine and rank
  const combined = [
    ...x.map((v) => ({ v, group: 0 })),
    ...y.map((v) => ({ v, group: 1 })),
  ];
  combined.sort((a, b) => a.v - b.v);

  // Assign average ranks for ties
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

  // Sum of ranks for group 0
  let r1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 0) {
      r1 += ranks[k];
    }
  }

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  // Normal approximation for p-value
  const muU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigmaU > 0 ? (u - muU) / sigmaU : 0;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return { u, p, significant: p < alpha, n1, n2, alpha };
}

/**
 * Outlier detection using the IQR method.
 *
 * A value is an outlier if it falls below Q1 - 1.5*IQR or above Q3 + 1.5*IQR.
 */
export function detectOutliers(values: number[]): {
  values: number[];
  outliers: number[];
  method: string;
  lowerBound: number;
  upperBound: number;
} {
  if (values.length === 0) {
    return { values: [], outliers: [], method: 'IQR', lowerBound: NaN, upperBound: NaN };
  }

  const s = sorted(values);
  const q1 = percentile(s, 25);
  const q3 = percentile(s, 75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = s.filter((v) => v < lowerBound || v > upperBound);

  return { values: s, outliers, method: 'IQR', lowerBound, upperBound };
}
