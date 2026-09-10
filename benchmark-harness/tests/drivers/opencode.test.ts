import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { OpenCodeDriver } from '../../src/drivers/opencode.js';
import { TokenSource, TokenConfidence } from '../../src/types/tokens.js';

const execFileAsync = promisify(execFile);

async function binaryExists(name: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(name, ['--version'], { timeout: 3_000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

const hasOpenCode = await binaryExists('opencode');

describe('OpenCodeDriver', () => {
  describe('constructor', () => {
    it('sets defaults when no options provided', () => {
      const driver = new OpenCodeDriver();
      assert.equal(driver.name, 'opencode');
      assert.equal(driver.version, '0.1.0');
    });

    it('uses provided options', () => {
      const driver = new OpenCodeDriver({
        binaryPath: '/usr/local/bin/opencode',
        version: '2.0.0',
      });
      assert.equal(driver.name, 'opencode');
      assert.equal(driver.version, '2.0.0');
    });
  });

  describe('isAvailable', () => {
    it('returns false when binary not found', async () => {
      const driver = new OpenCodeDriver({
        binaryPath: 'nonexistent-binary-xyz-123',
      });
      const available = await driver.isAvailable();
      assert.equal(available, false);
    });

    it('returns true when opencode is installed', { skip: hasOpenCode ? false : 'opencode not installed' }, async () => {
      const driver = new OpenCodeDriver();
      const available = await driver.isAvailable();
      assert.equal(available, true);
    });
  });

  describe('getTokenUsage', () => {
    it('returns unavailable tokens for missing file', async () => {
      const driver = new OpenCodeDriver();
      const usage = await driver.getTokenUsage('/nonexistent/path/session.json');
      assert.ok(usage);
      assert.equal(usage.source, TokenSource.Unavailable);
      assert.equal(usage.confidence, TokenConfidence.Unavailable);
      assert.equal(usage.inputTokens, null);
      assert.equal(usage.outputTokens, null);
      assert.equal(usage.total, null);
    });

    it('parses valid JSON session file', async () => {
      const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const tmpDir = await mkdtemp(join(tmpdir(), 'opencode-test-'));
      const sessionFile = join(tmpDir, 'session.json');

      try {
        await writeFile(sessionFile, JSON.stringify({
          inputTokens: 1000,
          outputTokens: 500,
          reasoningTokens: 200,
        }), 'utf-8');

        const driver = new OpenCodeDriver();
        const usage = await driver.getTokenUsage(sessionFile);
        assert.ok(usage);
        assert.equal(usage.source, TokenSource.OpenCodeNative);
        assert.equal(usage.confidence, TokenConfidence.Exact);
        assert.equal(usage.inputTokens, 1000);
        assert.equal(usage.outputTokens, 500);
        assert.equal(usage.reasoningTokens, 200);
        assert.equal(usage.total, 1700);
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('parses JSONL session file', async () => {
      const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const tmpDir = await mkdtemp(join(tmpdir(), 'opencode-test-'));
      const sessionFile = join(tmpDir, 'session.jsonl');

      try {
        await writeFile(sessionFile, [
          JSON.stringify({ event: 'start' }),
          JSON.stringify({ inputTokens: 300, outputTokens: 100 }),
          JSON.stringify({ event: 'end' }),
        ].join('\n'), 'utf-8');

        const driver = new OpenCodeDriver();
        const usage = await driver.getTokenUsage(sessionFile);
        assert.ok(usage);
        assert.equal(usage.source, TokenSource.SessionDerived);
        assert.equal(usage.inputTokens, 300);
        assert.equal(usage.outputTokens, 100);
        assert.equal(usage.total, 400);
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('execute', () => {
    it('executes with opencode binary', { skip: hasOpenCode ? false : 'opencode not installed' }, async () => {
      const { mkdtemp, rm } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const workspace = await mkdtemp(join(tmpdir(), 'opencode-exec-test-'));
      try {
        const driver = new OpenCodeDriver();
        const result = await driver.execute('echo hello', {
          workspace,
          fixture: '.',
          timeoutMs: 30_000,
          model: 'test-model',
        });
        assert.equal(typeof result.exitCode, 'number');
        assert.equal(typeof result.durationMs, 'number');
        assert.equal(typeof result.output, 'string');
        assert.equal(typeof result.agentOutput, 'string');
        assert.ok(result.durationMs >= 0);
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }
    });
  });
});
