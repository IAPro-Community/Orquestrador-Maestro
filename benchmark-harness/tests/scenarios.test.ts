/**
 * Tests for scenario validation and loading.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateScenario } from '../src/scenarios/index.js';
import { loadScenario, loadAllScenarios } from '../src/scenarios/loader.js';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_DIR = join(__dirname, '__test-scenarios-fixture__');

function makeValidScenario(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    task: 'Fix the bug in index.ts',
    fixture: { path: './fixtures/test' },
    acceptance: {
      criteria: [
        { type: 'build', name: 'build check', command: 'npm run build' },
      ],
    },
    limits: { maxTimeMs: 30000 },
    ...overrides,
  };
}

describe('validateScenario', () => {
  it('should accept a valid scenario', () => {
    const data = makeValidScenario();
    const result = validateScenario(data);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.scenario);
    assert.equal(result.scenario!.id, 'test-scenario');
    assert.ok(result.scenario!.taskHash);
  });

  it('should compute taskHash as SHA-256 of task', () => {
    const data = makeValidScenario({ task: 'Hello world' });
    const result = validateScenario(data);

    assert.equal(result.valid, true);
    const expected = createHash('sha256').update('Hello world').digest('hex');
    assert.equal(result.scenario!.taskHash, expected);
  });

  it('should reject non-object input', () => {
    const result = validateScenario('not an object');
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('Input is not an object'));
  });

  it('should reject null input', () => {
    const result = validateScenario(null);
    assert.equal(result.valid, false);
  });

  it('should reject missing id', () => {
    const data = makeValidScenario();
    delete (data as any).id;
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('id')));
  });

  it('should reject invalid id format (not kebab-case)', () => {
    const data = makeValidScenario({ id: 'Not_Kebab' });
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('kebab-case')));
  });

  it('should reject missing name', () => {
    const data = makeValidScenario();
    delete (data as any).name;
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
  });

  it('should reject missing task', () => {
    const data = makeValidScenario();
    delete (data as any).task;
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('task')));
  });

  it('should reject missing fixture', () => {
    const data = makeValidScenario();
    delete (data as any).fixture;
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('fixture')));
  });

  it('should reject missing fixture.path', () => {
    const data = makeValidScenario({ fixture: {} });
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('fixture.path')));
  });

  it('should reject missing acceptance', () => {
    const data = makeValidScenario();
    delete (data as any).acceptance;
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('acceptance')));
  });

  it('should reject empty criteria array', () => {
    const data = makeValidScenario({
      acceptance: { criteria: [] },
    });
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('must not be empty')));
  });

  it('should reject invalid criterion type', () => {
    const data = makeValidScenario({
      acceptance: {
        criteria: [{ type: 'invalid_type', name: 'bad' }],
      },
    });
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('valid criterion type')));
  });

  it('should reject criterion with missing name', () => {
    const data = makeValidScenario({
      acceptance: {
        criteria: [{ type: 'build', name: '' }],
      },
    });
    const result = validateScenario(data);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('name is missing')));
  });

  it('should accept optional fields', () => {
    const data = makeValidScenario({
      description: 'A test scenario',
      model: 'claude-sonnet-4-20250514',
      tags: ['fast', 'build'],
      integrity: {
        scenarioHash: 'abc123',
        hiddenTestsHash: 'def456',
        verifierHash: 'ghi789',
      },
    });
    const result = validateScenario(data);

    assert.equal(result.valid, true);
    assert.equal(result.scenario!.description, 'A test scenario');
    assert.equal(result.scenario!.model, 'claude-sonnet-4-20250514');
    assert.deepEqual(result.scenario!.tags, ['fast', 'build']);
    assert.equal(result.scenario!.integrity?.scenarioHash, 'abc123');
  });

  it('should validate all criterion types', () => {
    const types = [
      'hidden_tests',
      'build',
      'typecheck',
      'existing_tests',
      'lint',
      'integrity',
      'filesystem',
      'custom',
    ];
    for (const type of types) {
      const data = makeValidScenario({
        acceptance: {
          criteria: [{ type, name: `test ${type}` }],
        },
      });
      const result = validateScenario(data);
      assert.equal(result.valid, true, `Type ${type} should be valid`);
    }
  });

  it('should cleanup', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
  });
});

describe('loadScenario', () => {
  it('should load a valid scenario from disk', async () => {
    await rm(FIXTURE_DIR, { recursive: true, force: true });
    await mkdir(FIXTURE_DIR, { recursive: true });

    const scenarioPath = join(FIXTURE_DIR, 'valid.json');
    const scenario = makeValidScenario();
    await writeFile(scenarioPath, JSON.stringify(scenario));

    const loaded = await loadScenario(scenarioPath);

    assert.equal(loaded.id, 'test-scenario');
    assert.equal(loaded.task, 'Fix the bug in index.ts');
    assert.ok(loaded.taskHash);
  });

  it('should throw on non-existent file', async () => {
    await assert.rejects(
      () => loadScenario(join(FIXTURE_DIR, 'nonexistent.json')),
      (err: Error) => {
        assert.ok(err.message.includes('Failed to read scenario file'));
        return true;
      },
    );
  });

  it('should throw on invalid JSON', async () => {
    const badPath = join(FIXTURE_DIR, 'bad.json');
    await writeFile(badPath, 'not json {{{');

    await assert.rejects(
      () => loadScenario(badPath),
      (err: Error) => {
        assert.ok(err.message.includes('Failed to parse scenario JSON'));
        return true;
      },
    );
  });

  it('should throw on invalid scenario structure', async () => {
    const badPath = join(FIXTURE_DIR, 'invalid.json');
    await writeFile(badPath, JSON.stringify({ foo: 'bar' }));

    await assert.rejects(
      () => loadScenario(badPath),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid scenario'));
        return true;
      },
    );
  });
});

describe('loadAllScenarios', () => {
  it('should load all valid scenarios from a directory', async () => {
    const dir = join(FIXTURE_DIR, 'multi');
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, 'a.json'),
      JSON.stringify(makeValidScenario({ id: 'scenario-a' })),
    );
    await writeFile(
      join(dir, 'b.json'),
      JSON.stringify(makeValidScenario({ id: 'scenario-b' })),
    );

    const scenarios = await loadAllScenarios(dir);

    assert.equal(scenarios.length, 2);
    const ids = scenarios.map((s) => s.id).sort();
    assert.deepEqual(ids, ['scenario-a', 'scenario-b']);
  });

  it('should skip non-scenario JSON files', async () => {
    const dir = join(FIXTURE_DIR, 'mixed');
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, 'valid.json'),
      JSON.stringify(makeValidScenario({ id: 'good-one' })),
    );
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'not-a-scenario' }),
    );

    const scenarios = await loadAllScenarios(dir);

    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0]!.id, 'good-one');
  });

  it('should handle non-existent directory', async () => {
    await assert.rejects(
      () => loadAllScenarios(join(FIXTURE_DIR, 'nope')),
      (err: Error) => {
        assert.ok(err.message.includes('Failed to read scenario directory'));
        return true;
      },
    );
  });

  it('should recurse into subdirectories', async () => {
    const dir = join(FIXTURE_DIR, 'nested');
    const sub = join(dir, 'level1');
    await mkdir(sub, { recursive: true });

    await writeFile(
      join(dir, 'root.json'),
      JSON.stringify(makeValidScenario({ id: 'root-scenario' })),
    );
    await writeFile(
      join(sub, 'nested.json'),
      JSON.stringify(makeValidScenario({ id: 'nested-scenario' })),
    );

    const scenarios = await loadAllScenarios(dir);

    assert.equal(scenarios.length, 2);
    const ids = scenarios.map((s) => s.id).sort();
    assert.deepEqual(ids, ['nested-scenario', 'root-scenario']);
  });
});
