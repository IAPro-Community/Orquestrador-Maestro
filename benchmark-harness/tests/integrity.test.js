/**
 * Tests for the benchmark integrity checker.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkBenchmarkIntegrity } from '../src/verifier/integrity.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WORKSPACE = join(__dirname, '__test-integrity-workspace__');
describe('checkBenchmarkIntegrity', () => {
    it('should pass when workspace is clean', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'clean.js'), 'console.log("hello");');
        const result = await checkBenchmarkIntegrity({ workspace: WORKSPACE });
        assert.equal(result.valid, true);
        assert.equal(result.violations.length, 0);
    });
    it('should detect test.skip', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'bad.test.js'), 'test.skip("cheat", () => {});');
        const result = await checkBenchmarkIntegrity({ workspace: WORKSPACE });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes('skip')));
    });
    it('should detect describe.skip', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'bad.test.js'), 'describe.skip("cheat", () => {});');
        const result = await checkBenchmarkIntegrity({ workspace: WORKSPACE });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes('skip')));
    });
    it('should detect .only', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'bad.test.js'), 'it.only("cheat", () => {});');
        const result = await checkBenchmarkIntegrity({ workspace: WORKSPACE });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes('only')));
    });
    it('should detect || true in scripts', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'cheat.sh'), '#!/bin/bash\necho test || true');
        const result = await checkBenchmarkIntegrity({ workspace: WORKSPACE });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes('|| true')));
    });
    it('should return per-check details', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'ok.js'), 'const x = 1;');
        const result = await checkBenchmarkIntegrity({ workspace: WORKSPACE });
        assert.ok(result.checks.length > 0);
        for (const check of result.checks) {
            assert.ok(check.name.length > 0);
            assert.equal(typeof check.passed, 'boolean');
            assert.equal(typeof check.message, 'string');
        }
    });
    it('should handle non-existent workspace gracefully', async () => {
        const result = await checkBenchmarkIntegrity({
            workspace: '/nonexistent/workspace/path',
        });
        assert.equal(typeof result.valid, 'boolean');
    });
    it('should include scenario-hash check when hash provided', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'scenario.json'), JSON.stringify({ id: 'test' }));
        const result = await checkBenchmarkIntegrity({
            workspace: WORKSPACE,
            scenarioHash: 'expected-hash',
        });
        const scenarioCheck = result.checks.find((c) => c.name === 'scenario-hash');
        assert.ok(scenarioCheck);
        assert.equal(scenarioCheck.passed, false);
    });
    it('should pass scenario-hash check when hash matches', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        const scenarioContent = JSON.stringify({ id: 'test-scenario' });
        const hash = createHash('sha256').update(scenarioContent).digest('hex');
        await writeFile(join(WORKSPACE, 'scenario.json'), scenarioContent);
        const result = await checkBenchmarkIntegrity({
            workspace: WORKSPACE,
            scenarioHash: hash,
        });
        const scenarioCheck = result.checks.find((c) => c.name === 'scenario-hash');
        assert.ok(scenarioCheck);
        assert.equal(scenarioCheck.passed, true);
    });
    it('should detect xit as skip variant', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
        await mkdir(WORKSPACE, { recursive: true });
        await writeFile(join(WORKSPACE, 'bad.test.js'), 'xit("cheat", () => {});');
        const result = await checkBenchmarkIntegrity({ workspace: WORKSPACE });
        assert.equal(result.valid, false);
        assert.ok(result.violations.some((v) => v.includes('xit')));
    });
    it('should cleanup', async () => {
        await rm(WORKSPACE, { recursive: true, force: true });
    });
});
//# sourceMappingURL=integrity.test.js.map