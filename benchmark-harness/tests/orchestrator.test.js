import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { orchestrateRun } from '../src/orchestrator/index.js';
import { TokenSource, TokenConfidence } from '../src/types/tokens.js';
function createMockDriver(overrides) {
    return {
        name: 'mock-driver',
        version: '0.0.1-test',
        async isAvailable() {
            return true;
        },
        async execute(_task, _options) {
            if (overrides?.throw) {
                throw overrides.throw;
            }
            return {
                output: overrides?.output ?? 'mock agent output',
                exitCode: overrides?.exitCode ?? 0,
                tokens: overrides?.tokens ?? {
                    inputTokens: 100,
                    outputTokens: 50,
                    reasoningTokens: null,
                    cacheReadTokens: null,
                    cacheWriteTokens: null,
                    total: 150,
                    source: TokenSource.ProviderReported,
                    confidence: TokenConfidence.Exact,
                },
                durationMs: 42,
                sessionFile: '',
                agentOutput: overrides?.output ?? 'mock agent output',
                toolUsage: null,
            };
        },
    };
}
function createMockScenario(fixturePath) {
    return {
        id: 'test-mock-scenario',
        name: 'Mock Test Scenario',
        task: 'Write a function that returns 42',
        fixture: { path: fixturePath },
        acceptance: { criteria: [] },
        limits: { maxTimeMs: 60_000 },
        model: 'test-model',
    };
}
describe('orchestrator', () => {
    describe('computeHash', () => {
        it('produces consistent SHA-256 for the same input', async () => {
            const { mkdtemp, rm } = await import('node:fs/promises');
            const tmpDir = await mkdtemp(join(tmpdir(), 'orch-hash-test-'));
            const fixtureDir = join(tmpDir, 'fixture');
            const evidenceDir = join(tmpDir, 'evidence');
            try {
                await mkdir(fixtureDir, { recursive: true });
                await writeFile(join(fixtureDir, 'index.ts'), 'export const x = 1;\n', 'utf-8');
                await mkdir(evidenceDir, { recursive: true });
                const task = 'Write a function that returns 42';
                const expectedHash = createHash('sha256').update(task).digest('hex');
                const scenario = createMockScenario(fixtureDir);
                const driver = createMockDriver();
                const result1 = await orchestrateRun({
                    scenario,
                    condition: 'vanilla',
                    driver,
                    evidenceBase: evidenceDir,
                });
                assert.equal(result1.report.taskHash, expectedHash);
                assert.equal(result1.report.taskHash.length, 64);
                assert.ok(/^[0-9a-f]{64}$/.test(result1.report.taskHash));
            }
            finally {
                await rm(tmpDir, { recursive: true, force: true });
            }
        });
        it('produces different hashes for different inputs', async () => {
            const { mkdtemp, rm } = await import('node:fs/promises');
            const tmpDir = await mkdtemp(join(tmpdir(), 'orch-hash-diff-'));
            const fixtureDir = join(tmpDir, 'fixture');
            const evidenceDir = join(tmpDir, 'evidence');
            try {
                await mkdir(fixtureDir, { recursive: true });
                await writeFile(join(fixtureDir, 'index.ts'), 'export const x = 1;\n', 'utf-8');
                await mkdir(evidenceDir, { recursive: true });
                const expectedHash1 = createHash('sha256').update('task alpha').digest('hex');
                const expectedHash2 = createHash('sha256').update('task beta').digest('hex');
                const scenario1 = createMockScenario(fixtureDir);
                scenario1.task = 'task alpha';
                const scenario2 = createMockScenario(fixtureDir);
                scenario2.task = 'task beta';
                const result1 = await orchestrateRun({
                    scenario: scenario1,
                    condition: 'vanilla',
                    driver: createMockDriver(),
                    evidenceBase: evidenceDir,
                });
                const result2 = await orchestrateRun({
                    scenario: scenario2,
                    condition: 'vanilla',
                    driver: createMockDriver(),
                    evidenceBase: evidenceDir,
                });
                assert.equal(result1.report.taskHash, expectedHash1);
                assert.equal(result2.report.taskHash, expectedHash2);
                assert.notEqual(result1.report.taskHash, result2.report.taskHash);
            }
            finally {
                await rm(tmpDir, { recursive: true, force: true });
            }
        });
    });
    describe('orchestrateRun', () => {
        it('completes successfully with mock driver', async () => {
            const tmpDir = await mkdtemp(join(tmpdir(), 'orch-run-test-'));
            const fixtureDir = join(tmpDir, 'fixture');
            const evidenceDir = join(tmpDir, 'evidence');
            try {
                await mkdir(fixtureDir, { recursive: true });
                await writeFile(join(fixtureDir, 'index.ts'), 'export const x = 1;\n', 'utf-8');
                await mkdir(evidenceDir, { recursive: true });
                const scenario = createMockScenario(fixtureDir);
                const driver = createMockDriver();
                const result = await orchestrateRun({
                    scenario,
                    condition: 'vanilla',
                    driver,
                    evidenceBase: evidenceDir,
                });
                assert.equal(result.success, true);
                assert.equal(result.report.status, 'passed');
                assert.equal(result.report.scenarioId, 'test-mock-scenario');
                assert.equal(result.report.condition, 'vanilla');
                assert.equal(result.report.driver.name, 'mock-driver');
                assert.equal(result.report.driver.version, '0.0.1-test');
                assert.equal(result.report.tokens.source, TokenSource.ProviderReported);
                assert.equal(result.report.tokens.total, 150);
                assert.ok(result.report.timing.durationMs >= 0);
                assert.ok(result.report.createdAt);
                assert.equal(result.error, undefined);
            }
            finally {
                await rm(tmpDir, { recursive: true, force: true });
            }
        });
        it('handles driver errors gracefully', async () => {
            const tmpDir = await mkdtemp(join(tmpdir(), 'orch-err-test-'));
            const fixtureDir = join(tmpDir, 'fixture');
            const evidenceDir = join(tmpDir, 'evidence');
            try {
                await mkdir(fixtureDir, { recursive: true });
                await writeFile(join(fixtureDir, 'index.ts'), 'export const x = 1;\n', 'utf-8');
                await mkdir(evidenceDir, { recursive: true });
                const scenario = createMockScenario(fixtureDir);
                const driver = createMockDriver({
                    throw: new Error('driver crashed'),
                });
                const result = await orchestrateRun({
                    scenario,
                    condition: 'maestro',
                    driver,
                    evidenceBase: evidenceDir,
                });
                assert.equal(result.success, false);
                assert.equal(result.report.status, 'error');
                assert.equal(result.report.condition, 'maestro');
                assert.ok(result.error);
                assert.ok(result.error.includes('driver crashed'));
            }
            finally {
                await rm(tmpDir, { recursive: true, force: true });
            }
        });
        it('reports failed status when driver returns non-zero exit code', async () => {
            const tmpDir = await mkdtemp(join(tmpdir(), 'orch-exit-test-'));
            const fixtureDir = join(tmpDir, 'fixture');
            const evidenceDir = join(tmpDir, 'evidence');
            try {
                await mkdir(fixtureDir, { recursive: true });
                await writeFile(join(fixtureDir, 'index.ts'), 'export const x = 1;\n', 'utf-8');
                await mkdir(evidenceDir, { recursive: true });
                const scenario = createMockScenario(fixtureDir);
                const driver = createMockDriver({ exitCode: 1 });
                const result = await orchestrateRun({
                    scenario,
                    condition: 'vanilla',
                    driver,
                    evidenceBase: evidenceDir,
                });
                assert.equal(result.success, false);
                assert.equal(result.report.status, 'failed');
                assert.ok(result.report.failureType);
            }
            finally {
                await rm(tmpDir, { recursive: true, force: true });
            }
        });
    });
});
//# sourceMappingURL=orchestrator.test.js.map