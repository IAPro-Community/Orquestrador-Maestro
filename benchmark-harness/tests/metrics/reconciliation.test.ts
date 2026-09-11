import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTokenUsage, validateTokenUsage } from '../../src/metrics/reconciliation.js';
import type { TokenUsage } from '../../src/types/tokens.js';
import { TokenSource, TokenConfidence } from '../../src/types/tokens.js';

function makeUsage(overrides: Partial<TokenUsage> & { source?: TokenSource; confidence?: TokenConfidence } = {}): TokenUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    total: 150,
    source: TokenSource.ProviderReported,
    confidence: TokenConfidence.Exact,
    ...overrides,
  };
}

function makeUnavailable(): TokenUsage {
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

describe('reconcileTokenUsage', () => {
  it('returns unavailable with empty sources', () => {
    const result = reconcileTokenUsage([]);
    assert.equal(result.source, TokenSource.Unavailable);
    assert.equal(result.confidence, TokenConfidence.Unavailable);
    assert.equal(result.reconciled.total, null);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('No token sources'));
  });

  it('returns the single source when only one is provided', () => {
    const usage = makeUsage({ total: 200 });
    const result = reconcileTokenUsage([
      { usage, source: TokenSource.SessionDerived },
    ]);
    assert.equal(result.source, TokenSource.SessionDerived);
    assert.equal(result.reconciled.total, 200);
    assert.equal(result.reconciled.inputTokens, 100);
    assert.equal(result.reconciled.outputTokens, 50);
    assert.equal(result.warnings.length, 0);
  });

  it('picks highest priority source from multiple sources', () => {
    const providerUsage = makeUsage({ total: 500 });
    const sessionUsage = makeUsage({ total: 300 });

    const result = reconcileTokenUsage([
      { usage: sessionUsage, source: TokenSource.SessionDerived },
      { usage: providerUsage, source: TokenSource.ProviderReported },
    ]);

    assert.equal(result.source, TokenSource.ProviderReported);
    assert.equal(result.reconciled.total, 500);
  });

  it('picks opencode-native over session-derived', () => {
    const nativeUsage = makeUsage({ total: 400 });
    const sessionUsage = makeUsage({ total: 300 });

    const result = reconcileTokenUsage([
      { usage: sessionUsage, source: TokenSource.SessionDerived },
      { usage: nativeUsage, source: TokenSource.OpenCodeNative },
    ]);

    assert.equal(result.source, TokenSource.OpenCodeNative);
    assert.equal(result.reconciled.total, 400);
  });

  it('emits warning when sources disagree significantly', () => {
    const high = makeUsage({ total: 1000 });
    const low = makeUsage({ total: 500 });

    const result = reconcileTokenUsage([
      { usage: high, source: TokenSource.ProviderReported },
      { usage: low, source: TokenSource.SessionDerived },
    ]);

    assert.equal(result.source, TokenSource.ProviderReported);
    assert.equal(result.reconciled.total, 1000);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('disagreement'));
  });

  it('does not warn when sources agree closely', () => {
    const a = makeUsage({ total: 1000 });
    const b = makeUsage({ total: 1050 });

    const result = reconcileTokenUsage([
      { usage: a, source: TokenSource.ProviderReported },
      { usage: b, source: TokenSource.SessionDerived },
    ]);

    assert.equal(result.warnings.length, 0);
  });

  it('handles sources with null totals without warning', () => {
    const withTotal = makeUsage({ total: 100 });
    const withoutTotal = makeUsage({ total: null });

    const result = reconcileTokenUsage([
      { usage: withTotal, source: TokenSource.ProviderReported },
      { usage: withoutTotal, source: TokenSource.SessionDerived },
    ]);

    assert.equal(result.source, TokenSource.ProviderReported);
    assert.equal(result.warnings.length, 0);
  });
});

describe('validateTokenUsage', () => {
  it('passes for valid usage', () => {
    const usage = makeUsage({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 20,
      total: 170,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('passes for valid usage with null reasoning', () => {
    const usage = makeUsage({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: null,
      total: 150,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('fails for negative inputTokens', () => {
    const usage = makeUsage({
      inputTokens: -10,
      outputTokens: 50,
      total: 40,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('inputTokens'));
    assert.ok(result.errors[0].includes('non-negative'));
  });

  it('fails for negative outputTokens', () => {
    const usage = makeUsage({
      inputTokens: 100,
      outputTokens: -5,
      total: 95,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('outputTokens'));
  });

  it('fails for negative reasoningTokens', () => {
    const usage = makeUsage({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: -1,
      total: 149,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('reasoningTokens'));
  });

  it('fails for inconsistent total (total > sum)', () => {
    const usage = makeUsage({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: null,
      total: 200,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('total'));
    assert.ok(result.errors[0].includes('does not equal'));
  });

  it('fails for inconsistent total (total < sum)', () => {
    const usage = makeUsage({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: null,
      total: 100,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('total'));
  });

  it('collects multiple errors at once', () => {
    const usage = makeUsage({
      inputTokens: -1,
      outputTokens: -2,
      total: 999,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3);
  });

  it('passes when total is null', () => {
    const usage = makeUsage({
      inputTokens: 100,
      outputTokens: 50,
      total: null,
      source: TokenSource.ProviderReported,
    });
    const result = validateTokenUsage(usage);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });
});
