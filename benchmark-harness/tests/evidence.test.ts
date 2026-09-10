import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createEvidenceDir,
  preserveRawEvidence,
  sanitizeSecrets,
} from '../src/evidence/index.js';

const TMP = join('/tmp', 'evidence-test-' + Date.now());

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('createEvidenceDir', () => {
  it('creates a timestamped directory', async () => {
    const dir = await createEvidenceDir(TMP, 'run-1');
    assert.ok(existsSync(dir));
    assert.ok(dir.includes('run-1'));
  });

  it('creates nested directories', async () => {
    const nested = join(TMP, 'a', 'b');
    const dir = await createEvidenceDir(nested, 'run-2');
    assert.ok(existsSync(dir));
  });
});

describe('sanitizeSecrets', () => {
  it('removes OpenAI API keys', () => {
    const input = `api_key=${'sk-'}abc123def456ghi789jkl012mno`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('sk-abc'));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('removes Anthropic API keys', () => {
    const input = `key: ${'sk-'}ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('sk-ant-'));
  });

  it('removes Bearer tokens', () => {
    const input = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456';
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('Bearer abcdefgh'));
  });

  it('removes GitHub tokens', () => {
    const input = `token: ${'ghp_'}ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('ghp_'));
  });

  it('removes JWT tokens', () => {
    const input = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('eyJ'));
  });

  it('removes AWS keys', () => {
    const input = `AWS_ACCESS_KEY_ID=${'AKIA'}IOSFODNN7EXAMPLE`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('AKIAIOSFODNN7'));
  });

  it('does not alter clean content', () => {
    const input = 'This is a normal log message with no secrets.';
    assert.equal(sanitizeSecrets(input), input);
  });

  it('handles empty string', () => {
    assert.equal(sanitizeSecrets(''), '');
  });
});

describe('preserveRawEvidence', () => {
  it('creates evidence files', async () => {
    const result = await preserveRawEvidence({
      workspace: TMP,
      runId: 'test-run',
      agentOutput: 'agent stdout',
      agentExitCode: 0,
      verifierOutput: 'verifier stdout',
      verifierExitCode: 0,
      sessionFile: '/tmp/session.json',
    });

    assert.ok(existsSync(result.rawDir));
    assert.equal(result.runId, 'test-run');
    assert.ok(result.rawFiles.length >= 3);
    assert.ok(result.rawFiles.some((f: string) => f.includes('agent-output')));
    assert.ok(result.rawFiles.some((f: string) => f.includes('verifier-output')));
    assert.ok(result.rawFiles.some((f: string) => f.includes('session.json')));
  });

  it('sanitizes secrets in agent output', async () => {
    const result = await preserveRawEvidence({
      workspace: TMP,
      runId: 'test-run',
      agentOutput: `api_key=${'sk-'}supersecret12345678901234`,
      agentExitCode: 0,
      verifierOutput: 'ok',
      verifierExitCode: 0,
      sessionFile: '/tmp/session.json',
    });

    const agentFile = result.rawFiles.find((f: string) => f.includes('agent-output'));
    assert.ok(agentFile);
    const content = readFileSync(agentFile, 'utf-8');
    assert.ok(!content.includes('sk-supersecret'));
    assert.ok(content.includes('[REDACTED]'));
  });

  it('writes git diff when provided', async () => {
    const result = await preserveRawEvidence({
      workspace: TMP,
      runId: 'test-run',
      agentOutput: 'ok',
      agentExitCode: 0,
      verifierOutput: 'ok',
      verifierExitCode: 0,
      sessionFile: '/tmp/session.json',
      gitDiff: 'diff --git a/file b/file',
    });

    assert.ok(result.rawFiles.some((f: string) => f.includes('git-diff')));
  });

  it('writes files changed when provided', async () => {
    const result = await preserveRawEvidence({
      workspace: TMP,
      runId: 'test-run',
      agentOutput: 'ok',
      agentExitCode: 0,
      verifierOutput: 'ok',
      verifierExitCode: 0,
      sessionFile: '/tmp/session.json',
      filesChanged: ['src/index.ts', 'tests/test.ts'],
    });

    const fcFile = result.rawFiles.find((f: string) => f.includes('files-changed'));
    assert.ok(fcFile);
    const content = JSON.parse(readFileSync(fcFile, 'utf-8'));
    assert.deepEqual(content, ['src/index.ts', 'tests/test.ts']);
  });

  it('records session metadata', async () => {
    const result = await preserveRawEvidence({
      workspace: TMP,
      runId: 'meta-test',
      agentOutput: 'ok',
      agentExitCode: 1,
      verifierOutput: 'fail',
      verifierExitCode: 2,
      sessionFile: '/tmp/sess.json',
    });

    const sessionFile = result.rawFiles.find((f: string) => f.includes('session.json'));
    assert.ok(sessionFile);
    const meta = JSON.parse(readFileSync(sessionFile, 'utf-8'));
    assert.equal(meta.runId, 'meta-test');
    assert.equal(meta.agentExitCode, 1);
    assert.equal(meta.verifierExitCode, 2);
    assert.equal(meta.sessionFile, '/tmp/sess.json');
    assert.ok(meta.capturedAt);
  });
});
