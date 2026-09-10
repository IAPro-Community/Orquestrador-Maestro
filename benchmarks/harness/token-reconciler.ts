import type { TokenSource } from "./types";
import type { TokenUsage } from "./token-usage";
import { createTokenUsage } from "./token-usage";

export interface ReconciledUsage {
  usage: TokenUsage;
  sourcesCompared: number;
  maxDivergence: number;
  measurementAnomaly: boolean;
}

function confidenceWeightedMerge(sources: TokenUsage[]): TokenUsage {
  const fieldKeys = [
    "inputTokens",
    "outputTokens",
    "reasoningTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "totalTokens",
  ] as const;

  const merged: Record<string, number | null> = {};
  for (const key of fieldKeys) {
    const values = sources
      .map((s) => ({ value: s[key], confidence: s.confidence }))
      .filter((v): v is { value: number; confidence: number } => v.value != null);

    if (values.length === 0) {
      merged[key] = null;
      continue;
    }

    const totalConfidence = values.reduce((s, v) => s + v.confidence, 0);
    merged[key] = values.reduce((s, v) => s + v.value * v.confidence, 0) / totalConfidence;
  }

  const bestSource = sources.reduce((best, s) =>
    s.confidence > best.confidence ? s : best
  );

  return {
    inputTokens: merged.inputTokens != null ? Math.round(merged.inputTokens) : null,
    outputTokens: merged.outputTokens != null ? Math.round(merged.outputTokens) : null,
    reasoningTokens: merged.reasoningTokens != null ? Math.round(merged.reasoningTokens) : null,
    cacheReadTokens: merged.cacheReadTokens != null ? Math.round(merged.cacheReadTokens) : null,
    cacheWriteTokens: merged.cacheWriteTokens != null ? Math.round(merged.cacheWriteTokens) : null,
    totalTokens: merged.totalTokens != null ? Math.round(merged.totalTokens) : null,
    source: bestSource.source,
    confidence: bestSource.confidence,
    reconciled: true,
    anomalies: [],
  };
}

function computeMaxDivergence(sources: TokenUsage[]): number {
  if (sources.length < 2) return 0;

  const totals = sources
    .map((s) => s.totalTokens)
    .filter((t): t is number => t != null);

  if (totals.length < 2) return 0;

  const max = Math.max(...totals);
  const min = Math.min(...totals);
  return max > 0 ? (max - min) / max : 0;
}

function detectAnomalies(sources: TokenUsage[]): string[] {
  const anomalies: string[] = [];

  if (sources.length >= 2) {
    const divergences = sources
      .map((s) => s.totalTokens)
      .filter((t): t is number => t != null);
    if (divergences.length >= 2) {
      const max = Math.max(...divergences);
      const min = Math.min(...divergences);
      if (max > 0 && (max - min) / max > 0.2) {
        anomalies.push(`Token count divergence >20% across sources (min=${min}, max=${max})`);
      }
    }
  }

  const hasZero = sources.some((s) => s.totalTokens === 0);
  const hasLarge = sources.some((s) => (s.totalTokens ?? 0) > 1000000);
  if (hasZero && hasLarge) {
    anomalies.push("Mixed zero and very large token counts across sources");
  }

  for (const s of sources) {
    if (s.inputTokens != null && s.outputTokens != null && s.totalTokens != null) {
      const expected = s.inputTokens + s.outputTokens + (s.reasoningTokens ?? 0);
      if (Math.abs(s.totalTokens - expected) > Math.max(10, expected * 0.05)) {
        anomalies.push(`totalTokens (${s.totalTokens}) does not match sum of parts (${expected}) for source ${s.source}`);
      }
    }
  }

  return anomalies;
}

export function reconcileTokenUsage(sources: TokenUsage[]): ReconciledUsage {
  if (sources.length === 0) {
    return {
      usage: createTokenUsage({ source: "unavailable", anomalies: ["no token sources provided"] }),
      sourcesCompared: 0,
      maxDivergence: 0,
      measurementAnomaly: false,
    };
  }

  if (sources.length === 1) {
    return {
      usage: { ...sources[0], reconciled: true },
      sourcesCompared: 1,
      maxDivergence: 0,
      measurementAnomaly: false,
    };
  }

  const merged = confidenceWeightedMerge(sources);
  const maxDivergence = computeMaxDivergence(sources);
  const anomalies = detectAnomalies(sources);
  merged.anomalies = anomalies;

  return {
    usage: merged,
    sourcesCompared: sources.length,
    maxDivergence,
    measurementAnomaly: anomalies.length > 0,
  };
}
