/**
 * Tests for the external verifier.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAcceptanceSuite, type AcceptanceConfig } from '../src/verifier/index.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = join(__dirname, '__test-workspace__');
const HIDDEN_DIR = join(__dirname, '__test-hidden__');

describe('verifyAcceptanceSuite', () => {
  it('should pass all criteria when commands succeed', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await rm(HIDDEN_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    await mkdir(HIDDEN_DIR, { recursive: true });

    const config: AcceptanceConfig = {
      criteria: [
        { type: 'build', name: 'build check', command: 'echo ok' },
        { type: 'lint', name: 'lint check', command: 'echo clean' },
      ],
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.equal(result.passed, true);
    assert.equal(result.acceptanceRate, 1);
    assert.equal(result.criteria.length, 2);
    assert.equal(result.criteria[0]!.passed, true);
    assert.equal(result.criteria[1]!.passed, true);
    assert.equal(result.criteria[0]!.type, 'build');
    assert.equal(result.criteria[1]!.type, 'lint');
  });

  it('should fail when a command fails', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    const config: AcceptanceConfig = {
      criteria: [
        { type: 'build', name: 'failing build', command: 'exit 1' },
      ],
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.equal(result.passed, false);
    assert.equal(result.acceptanceRate, 0);
    assert.equal(result.criteria[0]!.passed, false);
    assert.ok(result.criteria[0]!.error);
  });

  it('should report duration for each criterion', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    const config: AcceptanceConfig = {
      criteria: [
        { type: 'typecheck', name: 'typecheck', command: 'echo done' },
      ],
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.ok(result.criteria[0]!.duration >= 0);
    assert.ok(result.criteria[0]!.duration < 5000);
  });

  it('should run hidden tests in isolated directory', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await rm(HIDDEN_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    await mkdir(HIDDEN_DIR, { recursive: true });

    // Create a simple test that passes (use .cjs for CommonJS compat).
    await writeFile(join(HIDDEN_DIR, 'test.cjs'),
      `const assert = require('node:assert/strict');
assert.strictEqual(1 + 1, 2, 'Math is broken');`);

    const config: AcceptanceConfig = {
      criteria: [
        {
          type: 'hidden_tests',
          name: 'hidden unit tests',
          command: 'node test.cjs',
        },
      ],
      hiddenTestPath: HIDDEN_DIR,
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.equal(result.passed, true);
    assert.equal(result.criteria[0]!.passed, true);
    assert.equal(result.criteria[0]!.type, 'hidden_tests');
  });

  it('should fail hidden tests when command fails', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await rm(HIDDEN_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    await mkdir(HIDDEN_DIR, { recursive: true });

    const config: AcceptanceConfig = {
      criteria: [
        {
          type: 'hidden_tests',
          name: 'failing hidden',
          command: 'exit 1',
        },
      ],
      hiddenTestPath: HIDDEN_DIR,
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.equal(result.passed, false);
    assert.equal(result.criteria[0]!.passed, false);
  });

  it('should run hidden_tests in workspace when hiddenTestPath is not configured', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    const config: AcceptanceConfig = {
      criteria: [
        {
          type: 'hidden_tests',
          name: 'no path hidden',
          command: 'echo noop',
        },
      ],
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    // New behavior: hidden_tests runs in workspace when no hiddenTestPath
    assert.equal(result.passed, true);
    assert.equal(result.criteria[0]!.passed, true);
  });

  it('should accept hiddenTestPath override parameter', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await rm(HIDDEN_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });
    await mkdir(HIDDEN_DIR, { recursive: true });

    await writeFile(join(HIDDEN_DIR, 'test.cjs'),
      `const assert = require('node:assert/strict');
assert.strictEqual(1 + 1, 2, 'Math is broken');`);

    const config: AcceptanceConfig = {
      criteria: [
        {
          type: 'hidden_tests',
          name: 'hidden via override',
          command: 'node test.cjs',
        },
      ],
      hiddenTestPath: '/wrong/path',
    };

    const result = await verifyAcceptanceSuite(
      FIXTURE_DIR,
      config,
      HIDDEN_DIR,
    );

    assert.equal(result.passed, true);
  });

  it('should compute acceptanceRate correctly for mixed results', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    const config: AcceptanceConfig = {
      criteria: [
        { type: 'build', name: 'pass', command: 'echo ok' },
        { type: 'lint', name: 'fail', command: 'exit 1' },
        { type: 'typecheck', name: 'pass2', command: 'echo ok' },
      ],
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.equal(result.passed, false);
    assert.ok(Math.abs(result.acceptanceRate - 2 / 3) < 0.001);
  });

  it('should capture command output', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    const config: AcceptanceConfig = {
      criteria: [
        { type: 'custom', name: 'output test', command: 'echo hello-world-123' },
      ],
    };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.ok(result.criteria[0]!.output.includes('hello-world-123'));
  });

  it('should handle empty criteria array', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    const config: AcceptanceConfig = { criteria: [] };

    const result = await verifyAcceptanceSuite(FIXTURE_DIR, config);

    assert.equal(result.passed, true);
    assert.equal(result.acceptanceRate, 1);
    assert.equal(result.criteria.length, 0);
  });

  it('should cleanup test dirs', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await rm(HIDDEN_DIR, { recursive: true, force: true });
  });
});
