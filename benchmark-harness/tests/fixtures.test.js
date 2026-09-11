/**
 * Tests for golden fixture management.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashFixture, copyFixtureToTemp, validateFixtureIntegrity } from '../src/fixtures/index.js';
import { mkdir, writeFile, rm, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = join(__dirname, '__test-fixtures-fixture__');
describe('hashFixture', () => {
    it('should return a hex string', async () => {
        await rm(FIXTURE_DIR, { recursive: true, force: true });
        await mkdir(FIXTURE_DIR, { recursive: true });
        await mkdir(join(FIXTURE_DIR, 'src'), { recursive: true });
        await writeFile(join(FIXTURE_DIR, 'index.ts'), 'export const x = 1;');
        await writeFile(join(FIXTURE_DIR, 'src', 'utils.ts'), 'export const y = 2;');
        await writeFile(join(FIXTURE_DIR, 'README.md'), '# Test fixture');
        const hash = await hashFixture(FIXTURE_DIR);
        assert.match(hash, /^[0-9a-f]{64}$/);
    });
    it('should be deterministic (same hash on repeated calls)', async () => {
        const hash1 = await hashFixture(FIXTURE_DIR);
        const hash2 = await hashFixture(FIXTURE_DIR);
        assert.equal(hash1, hash2);
    });
    it('should change when file content changes', async () => {
        const hash1 = await hashFixture(FIXTURE_DIR);
        const filePath = join(FIXTURE_DIR, 'index.ts');
        const original = await readFile(filePath, 'utf-8');
        await writeFile(filePath, 'export const x = 999;');
        const hash2 = await hashFixture(FIXTURE_DIR);
        await writeFile(filePath, original);
        assert.notEqual(hash1, hash2);
    });
    it('should handle empty directories', async () => {
        const emptyDir = join(FIXTURE_DIR, '__empty__');
        await mkdir(emptyDir, { recursive: true });
        const hash = await hashFixture(emptyDir);
        assert.match(hash, /^[0-9a-f]{64}$/);
        await rm(emptyDir, { recursive: true, force: true });
    });
    it('should include file paths in hash (renaming changes hash)', async () => {
        const dir1 = join(FIXTURE_DIR, '__hash-test-1__');
        const dir2 = join(FIXTURE_DIR, '__hash-test-2__');
        await mkdir(dir1, { recursive: true });
        await mkdir(dir2, { recursive: true });
        await writeFile(join(dir1, 'a.txt'), 'same content');
        await writeFile(join(dir2, 'b.txt'), 'same content');
        const hash1 = await hashFixture(dir1);
        const hash2 = await hashFixture(dir2);
        assert.notEqual(hash1, hash2);
        await rm(dir1, { recursive: true, force: true });
        await rm(dir2, { recursive: true, force: true });
    });
});
describe('copyFixtureToTemp', () => {
    it('should create a temporary copy', async () => {
        const tempDir = await copyFixtureToTemp(FIXTURE_DIR);
        try {
            assert.ok(tempDir);
            const s = await stat(tempDir);
            assert.equal(s.isDirectory(), true);
            const content = await readFile(join(tempDir, 'index.ts'), 'utf-8');
            assert.equal(content, 'export const x = 1;');
            const subContent = await readFile(join(tempDir, 'src', 'utils.ts'), 'utf-8');
            assert.equal(subContent, 'export const y = 2;');
        }
        finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });
    it('should create unique temp directories', async () => {
        const dir1 = await copyFixtureToTemp(FIXTURE_DIR);
        const dir2 = await copyFixtureToTemp(FIXTURE_DIR);
        try {
            assert.notEqual(dir1, dir2);
        }
        finally {
            await rm(dir1, { recursive: true, force: true });
            await rm(dir2, { recursive: true, force: true });
        }
    });
    it('should preserve nested directory structure', async () => {
        const tempDir = await copyFixtureToTemp(FIXTURE_DIR);
        try {
            const s = await stat(join(tempDir, 'src'));
            assert.equal(s.isDirectory(), true);
            const f = await stat(join(tempDir, 'src', 'utils.ts'));
            assert.equal(f.isFile(), true);
        }
        finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });
});
describe('validateFixtureIntegrity', () => {
    it('should return true when hash matches', async () => {
        const hash = await hashFixture(FIXTURE_DIR);
        const valid = await validateFixtureIntegrity(FIXTURE_DIR, hash);
        assert.equal(valid, true);
    });
    it('should return false when hash does not match', async () => {
        const valid = await validateFixtureIntegrity(FIXTURE_DIR, '0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(valid, false);
    });
    it('should return false for non-existent directory', async () => {
        const valid = await validateFixtureIntegrity('/nonexistent/path', 'abc123');
        assert.equal(valid, false);
    });
    it('should return false when fixture is modified after hashing', async () => {
        const hash = await hashFixture(FIXTURE_DIR);
        const filePath = join(FIXTURE_DIR, 'README.md');
        const original = await readFile(filePath, 'utf-8');
        await writeFile(filePath, 'tampered');
        const valid = await validateFixtureIntegrity(FIXTURE_DIR, hash);
        await writeFile(filePath, original);
        assert.equal(valid, false);
    });
    it('should cleanup', async () => {
        await rm(FIXTURE_DIR, { recursive: true, force: true });
    });
});
//# sourceMappingURL=fixtures.test.js.map