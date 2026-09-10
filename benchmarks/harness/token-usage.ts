import type { RunResult, TokenSource } from "./types";

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  source: TokenSource;
  confidence: number;
  rawReference?: string;
  reconciled: boolean;
  anomalies: string[];
}

export function createTokenUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    totalTokens: null,
    source: "unavailable",
    confidence: 0,
    reconciled: false,
    anomalies: [],
    ...overrides,
  };
}

export function sumTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  const add = (x: number | null, y: number | null): number | null => {
    if (x == null && y == null) return null;
    return (x ?? 0) + (y ?? 0);
  };

  return {
    inputTokens: add(a.inputTokens, b.inputTokens),
    outputTokens: add(a.outputTokens, b.outputTokens),
    reasoningTokens: add(a.reasoningTokens, b.reasoningTokens),
    cacheReadTokens: add(a.cacheReadTokens, b.cacheReadTokens),
    cacheWriteTokens: add(a.cacheWriteTokens, b.cacheWriteTokens),
    totalTokens: add(a.totalTokens, b.totalTokens),
    source: a.source === "provider-reported" ? a.source : b.source,
    confidence: Math.min(a.confidence, b.confidence),
    reconciled: a.reconciled && b.reconciled,
    anomalies: [...a.anomalies, ...b.anomalies],
  };
}

export function inferTotalTokens(usage: TokenUsage): TokenUsage {
  if (usage.totalTokens != null) return usage;

  const { inputTokens, outputTokens, reasoningTokens } = usage;
  if (inputTokens != null && outputTokens != null) {
    return {
      ...usage,
      totalTokens: inputTokens + outputTokens + (reasoningTokens ?? 0),
    };
  }

  return usage;
}

export interface TaskEconomics {
  tokensToSuccess: number | null;
  tokensPerAcceptedTask: number | null;
  acceptanceRate: number;
  retryTax: number | null;
  repeatedContextRate: number | null;
  uncachedRepeatedContextRate: number | null;
}

export function computeTaskEconomics(results: RunResult[]): TaskEconomics {
  if (results.length === 0) {
    return {
      tokensToSuccess: null,
      tokensPerAcceptedTask: null,
      acceptanceRate: 0,
      retryTax: null,
      repeatedContextRate: null,
      uncachedRepeatedContextRate: null,
    };
  }

  const totalTokensAll = results
    .map((r) => r.driverResult?.usage?.totalTokens)
    .filter((t): t is number => t != null);
  const totalTokens = totalTokensAll.reduce((s, t) => s + t, 0);

  const acceptedCount = results.filter((r) => r.validation?.passed).length;
  const acceptanceRate = results.length > 0 ? acceptedCount / results.length : 0;

  const tokensToSuccess = acceptedCount > 0 && totalTokens > 0
    ? totalTokens / acceptedCount
    : null;

  const tokensPerAcceptedTask = tokensToSuccess;

  const retries = results.map((r) => r.metadata?.retries ?? 0);
  const totalRetries = retries.reduce((s, r) => s + r, 0);
  const retryTax = results.length > 0
    ? totalRetries / results.length
    : null;

  const cachedTokens = results
    .map((r) => r.driverResult?.usage?.cachedTokens ?? 0)
    .reduce((s, c) => s + c, 0);
  const repeatedContextRate = totalTokens > 0 ? cachedTokens / totalTokens : null;

  const uncachedRepeatedContextRate = null;

  return {
    tokensToSuccess,
    tokensPerAcceptedTask,
    acceptanceRate,
    retryTax,
    repeatedContextRate,
    uncachedRepeatedContextRate,
  };
}
