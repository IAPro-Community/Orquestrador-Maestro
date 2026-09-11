/**
 * Usage reconciliation — verifies and reconciles token usage
 * across different sources.
 *
 * @module metrics/reconciliation
 */

import type { TokenUsage } from '../types/tokens.js';
import { TokenSource, TokenConfidence } from '../types/tokens.js';

/** Reconciliation result. */
export interface ReconciliationResult {
  /** Final reconciled token usage. */
  reconciled: TokenUsage;
  /** Whether reconciliation changed the values. */
  changed: boolean;
  /** Confidence after reconciliation. */
  confidence: TokenConfidence;
  /** Source after reconciliation. */
  source: TokenSource;
  /** Warnings about data quality. */
  warnings: string[];
}

/**
 * Reconcile token usage from multiple sources.
 *
 * Priority: provider-reported > opencode-native > session-derived > tokenizer-exact > tokenizer-estimated > unavailable
 *
 * When multiple sources are available, the highest-priority source wins.
 * If sources disagree, a warning is emitted.
 */
export function reconcileTokenUsage(
  sources: Array<{ usage: TokenUsage; source: TokenSource }>,
): ReconciliationResult {
  if (sources.length === 0) {
    return {
      reconciled: createUnavailable(),
      changed: false,
      confidence: TokenConfidence.Unavailable,
      source: TokenSource.Unavailable,
      warnings: ['No token sources provided'],
    };
  }

  // Sort by priority (higher priority first)
  const priorityOrder: Record<string, number> = {
    [TokenSource.ProviderReported]: 6,
    [TokenSource.OpenCodeNative]: 5,
    [TokenSource.SessionDerived]: 4,
    [TokenSource.TokenizerExact]: 3,
    [TokenSource.TokenizerEstimated]: 2,
    [TokenSource.Unavailable]: 1,
  };

  const sorted = [...sources].sort(
    (a, b) => (priorityOrder[b.source] ?? 0) - (priorityOrder[a.source] ?? 0),
  );

  const primary = sorted[0];
  const warnings: string[] = [];

  // Check for disagreements between sources
  if (sorted.length > 1) {
    for (let i = 1; i < sorted.length; i++) {
      const secondary = sorted[i];
      if (primary.usage.total !== null && secondary.usage.total !== null) {
        const diff = Math.abs(primary.usage.total - secondary.usage.total);
        if (diff > primary.usage.total * 0.1) {
          warnings.push(
            `Token disagreement: ${primary.source} reports ${primary.usage.total}, ` +
            `${secondary.source} reports ${secondary.usage.total} (diff: ${diff})`,
          );
        }
      }
    }
  }

  // Determine final confidence
  let finalConfidence = primary.usage.confidence;
  if (sorted.length > 1 && finalConfidence === TokenConfidence.Unavailable) {
    // Use second-best source
    finalConfidence = sorted[1].usage.confidence;
  }

  return {
    reconciled: { ...primary.usage },
    changed: false, // No actual mutation
    confidence: finalConfidence,
    source: primary.source,
    warnings,
  };
}

/**
 * Validate token usage for consistency.
 */
export function validateTokenUsage(usage: TokenUsage): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check individual fields are non-negative
  const fields = [
    'inputTokens',
    'outputTokens',
    'reasoningTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
  ] as const;

  for (const field of fields) {
    const value = usage[field];
    if (value !== null && value < 0) {
      errors.push(`${field} must be non-negative, got ${value}`);
    }
  }

  // Check total consistency
  if (usage.total !== null) {
    const input = usage.inputTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    const reasoning = usage.reasoningTokens ?? 0;
    const expected = input + output + reasoning;

    if (usage.total !== expected) {
      errors.push(
        `total (${usage.total}) does not equal input+output+reasoning (${expected})`,
      );
    }
  }

  // Check source vs null fields
  if (usage.source === TokenSource.Unavailable) {
    if (usage.inputTokens !== null || usage.outputTokens !== null) {
      errors.push('Source is unavailable but tokens are reported');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function createUnavailable(): TokenUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    total: null,
    source: TokenSource.Unavailable,
    confidence: TokenConfidence.Unavailable,
  };
}
