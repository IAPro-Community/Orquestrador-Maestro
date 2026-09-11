import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDistribution, welchTTest } from '../../src/metrics/statistics.js';
describe('computeDistribution', () => {
    it('returns zeros for empty array', () => {
        const d = computeDistribution([]);
        assert.equal(d.n, 0);
        assert.equal(d.mean, 0);
        assert.equal(d.median, 0);
        assert.equal(d.stddev, 0);
        assert.equal(d.ci95Lower, null);
        assert.equal(d.ci95Upper, null);
    });
    it('handles single value (n=1)', () => {
        const d = computeDistribution([42]);
        assert.equal(d.n, 1);
        assert.equal(d.mean, 42);
        assert.equal(d.median, 42);
        assert.equal(d.stddev, 0);
        assert.equal(d.p25, 42);
        assert.equal(d.p75, 42);
        assert.equal(d.p90, 42);
        assert.equal(d.p95, 42);
        assert.equal(d.ci95Lower, null);
        assert.equal(d.ci95Upper, null);
    });
    it('handles two values (n=2)', () => {
        const d = computeDistribution([10, 20]);
        assert.equal(d.n, 2);
        assert.equal(d.mean, 15);
        assert.equal(d.ci95Lower !== null, true);
        assert.equal(d.ci95Upper !== null, true);
    });
    it('computes correct mean', () => {
        const d = computeDistribution([1, 2, 3, 4, 5]);
        assert.equal(d.mean, 3);
    });
    it('computes correct median for odd count', () => {
        const d = computeDistribution([1, 3, 5, 7, 9]);
        assert.equal(d.median, 5);
    });
    it('computes correct median for even count', () => {
        const d = computeDistribution([1, 2, 3, 4]);
        assert.equal(d.median, 2.5);
    });
    it('computes correct stddev', () => {
        const d = computeDistribution([2, 4, 4, 4, 5, 5, 7, 9]);
        // Population stddev ≈ 2.0, sample stddev ≈ 2.138
        assert.ok(d.stddev > 2.1 && d.stddev < 2.15);
    });
    it('computes percentiles', () => {
        const values = Array.from({ length: 100 }, (_, i) => i + 1);
        const d = computeDistribution(values);
        assert.ok(Math.abs(d.p25 - 25.75) < 0.001);
        assert.ok(Math.abs(d.p75 - 75.25) < 0.001);
        assert.ok(Math.abs(d.p90 - 90.1) < 0.001);
        assert.ok(Math.abs(d.p95 - 95.05) < 0.001);
    });
    it('handles identical values', () => {
        const d = computeDistribution([5, 5, 5, 5, 5]);
        assert.equal(d.mean, 5);
        assert.equal(d.median, 5);
        assert.equal(d.stddev, 0);
        assert.equal(d.ci95Lower, 5);
        assert.equal(d.ci95Upper, 5);
    });
    it('handles negative values', () => {
        const d = computeDistribution([-10, -5, 0, 5, 10]);
        assert.equal(d.mean, 0);
        assert.equal(d.median, 0);
    });
});
describe('welchTTest', () => {
    it('returns neutral result when either sample has n < 2', () => {
        const result = welchTTest([1], [2, 3]);
        assert.equal(result.tStatistic, 0);
        assert.equal(result.pValue, 1);
        assert.equal(result.significant, false);
    });
    it('returns neutral result for empty arrays', () => {
        const result = welchTTest([], []);
        assert.equal(result.tStatistic, 0);
        assert.equal(result.pValue, 1);
        assert.equal(result.significant, false);
    });
    it('detects significant difference between clearly different distributions', () => {
        const vanilla = [100, 120, 110, 130, 140];
        const maestro = [50, 60, 55, 65, 70];
        const result = welchTTest(vanilla, maestro);
        assert.equal(result.significant, true);
        assert.ok(result.pValue < 0.05);
        assert.ok(result.tStatistic > 0);
    });
    it('does not flag identical distributions as significant', () => {
        const vanilla = [10, 20, 30, 40, 50];
        const maestro = [10, 20, 30, 40, 50];
        const result = welchTTest(vanilla, maestro);
        assert.equal(result.significant, false);
        assert.equal(result.tStatistic, 0);
        assert.equal(result.pValue, 1);
    });
    it('works with small sample sizes (n=2)', () => {
        const result = welchTTest([10, 20], [30, 40]);
        // Should not crash, may or may not be significant
        assert.ok(typeof result.tStatistic === 'number');
        assert.ok(typeof result.pValue === 'number');
    });
});
//# sourceMappingURL=statistics.test.js.map