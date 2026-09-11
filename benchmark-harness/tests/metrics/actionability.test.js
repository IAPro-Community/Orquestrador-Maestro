import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { measureActionability, summarizeActionability } from '../../src/metrics/actionability.js';
function run(condition, output, accepted = true) {
    return {
        runId: `${condition}-1`, scenarioId: 'demo', condition, driver: { name: 'test', version: '1' }, fixture: { path: '.', hash: 'hash' }, status: accepted ? 'passed' : 'failed',
        results: { acceptanceRate: accepted ? 1 : 0, accepted, criteria: [] }, tokens: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, cacheReadTokens: null, cacheWriteTokens: null, total: 2, source: 'unavailable', confidence: 'unavailable' }, timing: { startMs: 0, endMs: 1, durationMs: 1 }, evidence: { rawDir: '.', agentOutput: output, verifierOutput: accepted ? 'evidence test passed' : 'next step: inspect evidence' }, createdAt: new Date().toISOString()
    };
}
describe('actionability metrics', () => {
    it('measures focus signals deterministically', () => {
        const metrics = measureActionability(run('maestro-focus', 'Current state: running\nNext action: run tests\nEvidence: test passed'));
        assert.equal(metrics.nextActionPresent, true);
        assert.equal(metrics.completionEvidencePresent, true);
        assert.ok(metrics.tokensToFirstAction !== null);
    });
    it('keeps all three conditions in summaries', () => {
        const summary = summarizeActionability([run('vanilla', 'Implement task'), run('maestro', 'Next action: verify'), run('maestro-focus', 'Current: execute')]);
        assert.deepEqual(Object.keys(summary).sort(), ['maestro', 'maestro-focus', 'vanilla']);
    });
});
//# sourceMappingURL=actionability.test.js.map