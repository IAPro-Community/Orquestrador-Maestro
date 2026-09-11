import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sumTokenUsage, cumulativeTokensToFirstSuccess } from '../../src/metrics/tokens.js';
import { TokenSource, TokenConfidence } from '../../src/types/tokens.js';
function makeRun(overrides) {
    return {
        scenarioId: 'test-scenario',
        condition: 'vanilla',
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
describe('sumTokenUsage', () => {
    it('returns zeros for empty array', () => {
        const result = sumTokenUsage([]);
        assert.equal(result.total, 0);
        assert.deepEqual(result.perRun, []);
        assert.equal(result.accepted, 0);
        assert.equal(result.failed, 0);
        assert.deepEqual(result.perAcceptedRun, []);
    });
    it('sums tokens from a single run', () => {
        const runs = [makeRun({ runId: 'r1' })];
        const result = sumTokenUsage(runs);
        assert.equal(result.total, 150);
        assert.deepEqual(result.perRun, [150]);
        assert.equal(result.accepted, 150);
        assert.equal(result.failed, 0);
        assert.deepEqual(result.perAcceptedRun, [150]);
    });
    it('separates accepted vs failed runs', () => {
        const runs = [
            makeRun({ runId: 'r1', results: { acceptanceRate: 1, accepted: true, criteria: [] } }),
            makeRun({
                runId: 'r2',
                results: { acceptanceRate: 0, accepted: false, criteria: [] },
            }),
        ];
        const result = sumTokenUsage(runs);
        assert.equal(result.total, 300);
        assert.equal(result.accepted, 150);
        assert.equal(result.failed, 150);
        assert.deepEqual(result.perAcceptedRun, [150]);
    });
    it('handles null token totals gracefully', () => {
        const run = makeRun({ runId: 'r1' });
        run.tokens.total = null;
        const result = sumTokenUsage([run]);
        assert.equal(result.total, 0);
        assert.deepEqual(result.perRun, [null]);
    });
    it('sums multiple accepted runs', () => {
        const runs = [
            makeRun({ runId: 'r1', tokens: { ...makeRun({ runId: 'r1' }).tokens, total: 100 } }),
            makeRun({ runId: 'r2', tokens: { ...makeRun({ runId: 'r2' }).tokens, total: 200 } }),
            makeRun({ runId: 'r3', tokens: { ...makeRun({ runId: 'r3' }).tokens, total: 300 } }),
        ];
        const result = sumTokenUsage(runs);
        assert.equal(result.total, 600);
        assert.deepEqual(result.perAcceptedRun, [100, 200, 300]);
    });
});
describe('cumulativeTokensToFirstSuccess', () => {
    it('returns null for empty array', () => {
        assert.equal(cumulativeTokensToFirstSuccess([]), null);
    });
    it('returns null when no run is accepted', () => {
        const runs = [
            makeRun({ runId: 'r1', results: { acceptanceRate: 0, accepted: false, criteria: [] } }),
            makeRun({ runId: 'r2', results: { acceptanceRate: 0, accepted: false, criteria: [] } }),
        ];
        assert.equal(cumulativeTokensToFirstSuccess(runs), null);
    });
    it('returns cumulative tokens to first accepted run', () => {
        const runs = [
            makeRun({ runId: 'r1', tokens: { ...makeRun({ runId: 'r1' }).tokens, total: 100 }, results: { acceptanceRate: 0, accepted: false, criteria: [] } }),
            makeRun({ runId: 'r2', tokens: { ...makeRun({ runId: 'r2' }).tokens, total: 200 }, results: { acceptanceRate: 1, accepted: true, criteria: [] } }),
            makeRun({ runId: 'r3', tokens: { ...makeRun({ runId: 'r3' }).tokens, total: 300 }, results: { acceptanceRate: 1, accepted: true, criteria: [] } }),
        ];
        assert.equal(cumulativeTokensToFirstSuccess(runs), 300);
    });
    it('handles first run being accepted', () => {
        const runs = [
            makeRun({ runId: 'r1', tokens: { ...makeRun({ runId: 'r1' }).tokens, total: 150 } }),
        ];
        assert.equal(cumulativeTokensToFirstSuccess(runs), 150);
    });
    it('skips null token totals in cumulative sum', () => {
        const run1 = makeRun({ runId: 'r1', results: { acceptanceRate: 0, accepted: false, criteria: [] } });
        run1.tokens.total = null;
        const run2 = makeRun({ runId: 'r2', tokens: { ...makeRun({ runId: 'r2' }).tokens, total: 200 }, results: { acceptanceRate: 1, accepted: true, criteria: [] } });
        assert.equal(cumulativeTokensToFirstSuccess([run1, run2]), 200);
    });
});
//# sourceMappingURL=tokens.test.js.map