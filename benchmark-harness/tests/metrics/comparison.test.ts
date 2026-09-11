import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { comparePairs, groupRunsIntoPairs } from '../../src/metrics/comparison.js';
import type { BenchmarkRunReport } from '../../src/types/run.js';
import type { PairedRun } from '../../src/types/report.js';
import { TokenSource, TokenConfidence } from '../../src/types/tokens.js';

function makeRun(overrides: Partial<BenchmarkRunReport> & { runId: string; condition: 'vanilla' | 'maestro' }): BenchmarkRunReport {
  return {
    scenarioId: 'test-scenario',
    driver: { name: 'test', version: '0.0.1' },
    fixture: { path: '.', hash: 'abc' },
    status: 'passed',
    results: { acceptanceRate: 1, accepted: true, criteria: [] },
    tokens: {
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      total: 150,
      source: TokenSource.ProviderReported,
      confidence: TokenConfidence.Exact,
    },
    timing: { startMs: 0, endMs: 1000, durationMs: 1000 },
    evidence: { rawDir: '/tmp', agentOutput: '', verifierOutput: '' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('groupRunsIntoPairs', () => {
  it('returns empty for empty input', () => {
    assert.deepEqual(groupRunsIntoPairs([]), []);
  });

  it('pairs vanilla and maestro runs by scenario', () => {
    const runs = [
      makeRun({ runId: 'v1', condition: 'vanilla', scenarioId: 's1' }),
      makeRun({ runId: 'm1', condition: 'maestro', scenarioId: 's1' }),
    ];
    const pairs = groupRunsIntoPairs(runs);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].scenarioId, 's1');
    assert.equal(pairs[0].vanilla.runId, 'v1');
    assert.equal(pairs[0].maestro.runId, 'm1');
  });

  it('ignores unmatched runs', () => {
    const runs = [
      makeRun({ runId: 'v1', condition: 'vanilla', scenarioId: 's1' }),
      makeRun({ runId: 'm1', condition: 'maestro', scenarioId: 's2' }),
    ];
    const pairs = groupRunsIntoPairs(runs);
    assert.equal(pairs.length, 0);
  });

  it('takes first run per condition', () => {
    const runs = [
      makeRun({ runId: 'v1', condition: 'vanilla', scenarioId: 's1' }),
      makeRun({ runId: 'v2', condition: 'vanilla', scenarioId: 's1' }),
      makeRun({ runId: 'm1', condition: 'maestro', scenarioId: 's1' }),
    ];
    const pairs = groupRunsIntoPairs(runs);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].vanilla.runId, 'v1');
  });
});

describe('comparePairs', () => {
  it('returns neutral result for empty pairs', () => {
    const result = comparePairs([]);
    assert.equal(result.pairCount, 0);
    assert.equal(result.winner, 'tie');
    assert.equal(result.pValue, null);
    assert.equal(result.significant, false);
  });

  it('declares vanilla winner when vanilla has higher acceptance', () => {
    const pairs: PairedRun[] = [
      {
        scenarioId: 's1',
        vanilla: makeRun({ runId: 'v1', condition: 'vanilla', results: { acceptanceRate: 1, accepted: true, criteria: [] } }),
        maestro: makeRun({ runId: 'm1', condition: 'maestro', results: { acceptanceRate: 0, accepted: false, criteria: [] } }),
      },
    ];
    const result = comparePairs(pairs);
    assert.equal(result.winner, 'vanilla');
  });

  it('declares maestro winner when maestro has higher acceptance', () => {
    const pairs: PairedRun[] = [
      {
        scenarioId: 's1',
        vanilla: makeRun({ runId: 'v1', condition: 'vanilla', results: { acceptanceRate: 0, accepted: false, criteria: [] } }),
        maestro: makeRun({ runId: 'm1', condition: 'maestro', results: { acceptanceRate: 1, accepted: true, criteria: [] } }),
      },
    ];
    const result = comparePairs(pairs);
    assert.equal(result.winner, 'maestro');
  });

  it('uses tokens as tiebreaker when acceptance rates are equal', () => {
    const pairs: PairedRun[] = [
      {
        scenarioId: 's1',
        vanilla: makeRun({ runId: 'v1', condition: 'vanilla', tokens: { ...makeRun({ runId: 'v1', condition: 'vanilla' }).tokens, total: 200 } }),
        maestro: makeRun({ runId: 'm1', condition: 'maestro', tokens: { ...makeRun({ runId: 'm1', condition: 'maestro' }).tokens, total: 100 } }),
      },
    ];
    const result = comparePairs(pairs);
    assert.equal(result.winner, 'maestro');
  });

  it('declares tie when everything is equal', () => {
    const pairs: PairedRun[] = [
      {
        scenarioId: 's1',
        vanilla: makeRun({ runId: 'v1', condition: 'vanilla' }),
        maestro: makeRun({ runId: 'm1', condition: 'maestro' }),
      },
    ];
    const result = comparePairs(pairs);
    assert.equal(result.winner, 'tie');
  });

  it('computes distributions for each condition', () => {
    const pairs: PairedRun[] = [
      {
        scenarioId: 's1',
        vanilla: makeRun({ runId: 'v1', condition: 'vanilla' }),
        maestro: makeRun({ runId: 'm1', condition: 'maestro' }),
      },
    ];
    const result = comparePairs(pairs);
    assert.equal(result.vanillaDistribution.n, 1);
    assert.equal(result.maestroDistribution.n, 1);
  });

  it('handles null token totals', () => {
    const vRun = makeRun({ runId: 'v1', condition: 'vanilla' });
    vRun.tokens.total = null;
    const mRun = makeRun({ runId: 'm1', condition: 'maestro' });
    mRun.tokens.total = null;
    const pairs: PairedRun[] = [{ scenarioId: 's1', vanilla: vRun, maestro: mRun }];
    const result = comparePairs(pairs);
    assert.equal(result.vanillaDistribution.n, 0);
    assert.equal(result.maestroDistribution.n, 0);
    assert.equal(result.deltaMeanTokens, null);
  });

  it('computes correct delta', () => {
    const pairs: PairedRun[] = [
      {
        scenarioId: 's1',
        vanilla: makeRun({ runId: 'v1', condition: 'vanilla', tokens: { ...makeRun({ runId: 'v1', condition: 'vanilla' }).tokens, total: 300 } }),
        maestro: makeRun({ runId: 'm1', condition: 'maestro', tokens: { ...makeRun({ runId: 'm1', condition: 'maestro' }).tokens, total: 100 } }),
      },
    ];
    const result = comparePairs(pairs);
    assert.equal(result.deltaMeanTokens, 200);
    assert.ok(result.deltaRelativeTokens !== null);
    assert.ok(Math.abs(result.deltaRelativeTokens! - 200 / 300) < 0.001);
  });
});
