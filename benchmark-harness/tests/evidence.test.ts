import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createEvidenceDir,
  preserveRawEvidence,
  sanitizeSecrets,
  isClaimEligibleRun,
  summarizeEvidence,
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
    const input = `api_key=${String.fromCharCode(115,107,45)}abc123def456ghi789jkl012mno`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes(String.fromCharCode(115,107,45) + 'abc'));
    assert.ok(result.includes('[REDACTED]'));
  });

  it('removes Anthropic API keys', () => {
    const input = `key: ${String.fromCharCode(115,107,45)}ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes(String.fromCharCode(115,107,45) + 'ant-'));
  });

  it('removes Bearer tokens', () => {
    const input = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456';
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('Bearer abcdefgh'));
  });

  it('removes GitHub tokens', () => {
    const input = `token: ${String.fromCharCode(103,104,112,95)}ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes(String.fromCharCode(103,104,112,95)));
  });

  it('removes JWT tokens', () => {
    const input = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'].join('.');
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes('eyJ'));
  });

  it('removes AWS keys', () => {
    const input = `AWS_ACCESS_KEY_ID=${String.fromCharCode(65,75,73,65)}IOSFODNN7EXAMPLE`;
    const result = sanitizeSecrets(input);
    assert.ok(!result.includes(String.fromCharCode(65,75,73,65) + 'IOSFODNN7'));
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
      agentOutput: `api_key=${String.fromCharCode(115,107,45)}supersecret12345678901234`,
      agentExitCode: 0,
      verifierOutput: 'ok',
      verifierExitCode: 0,
      sessionFile: '/tmp/session.json',
    });

    const agentFile = result.rawFiles.find((f: string) => f.includes('agent-output'));
    assert.ok(agentFile);
    const content = readFileSync(agentFile, 'utf-8');
    assert.ok(!content.includes(String.fromCharCode(115,107,45) + 'supersecret'));
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

describe('isClaimEligibleRun', () => {
  function eligibleRun(overrides: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
      evidence: {
        publicClaimEligible: true,
        executionType: 'real-execution',
        reproducible: true,
        isolated: true,
      },
      environment: { container: true, containerImage: 'node:20-slim', containerId: 'abc123' },
      usage: { tokenSource: 'provider-reported', confidence: 'exact' },
      validation: { passed: true },
    };
    return { ...base, ...overrides };
  }

  it('accepts a fully eligible container run with provenance', () => {
    assert.equal(isClaimEligibleRun(eligibleRun() as never), true);
  });

  it('accepts report-shaped token source via tokens', () => {
    const run = eligibleRun({ usage: undefined, tokens: { tokenSource: 'provider-reported', confidence: 'exact' } });
    assert.equal(isClaimEligibleRun(run as never), true);
  });

  it('rejects container runs without provenance', () => {
    const run = eligibleRun({ environment: { container: true } });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects non-container runs (not isolated by policy)', () => {
    const run = eligibleRun({
      environment: { container: false },
      evidence: {
        publicClaimEligible: true,
        executionType: 'real-execution',
        reproducible: true,
        isolated: false,
      },
    });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('accepts authenticated OpenCode-native exact token usage', () => {
    const run = eligibleRun({ usage: { tokenSource: 'opencode-native', confidence: 'exact' } });
    assert.equal(isClaimEligibleRun(run as never), true);
  });

  it('rejects trusted sources without exact confidence', () => {
    const run = eligibleRun({ usage: { tokenSource: 'opencode-native', confidence: 'reliable' } });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects estimated token sources', () => {
    const run = eligibleRun({ usage: { tokenSource: 'tokenizer-estimated', confidence: 'estimated' } });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects failed validation', () => {
    const run = eligibleRun({ validation: { passed: false } });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects synthetic execution', () => {
    const run = eligibleRun({
      evidence: {
        publicClaimEligible: false,
        executionType: 'synthetic',
        reproducible: true,
        isolated: true,
      },
    });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects missing reproducibility', () => {
    const run = eligibleRun({
      evidence: {
        publicClaimEligible: true,
        executionType: 'real-execution',
        reproducible: false,
        isolated: true,
      },
    });
    assert.equal(isClaimEligibleRun(run as never), false);
  });
});

describe('summarizeEvidence', () => {
  it('summarizes mixed evidence without contamination', () => {
    const good = {
      evidence: { publicClaimEligible: true, executionType: 'real-execution', reproducible: true, isolated: true },
      environment: { container: true, containerImage: 'node:20-slim', containerId: 'deadbeef1234' },
      usage: { tokenSource: 'provider-reported', confidence: 'exact' },
      validation: { passed: true },
    };
    const bad = {
      evidence: { publicClaimEligible: false, executionType: 'synthetic', reproducible: true, isolated: true },
      environment: { container: false },
      usage: { tokenSource: 'unavailable' },
      validation: { passed: false },
    };
    const summary = summarizeEvidence([good, bad] as never[]);
    assert.equal(summary.totalRuns, 2);
    assert.equal(summary.claimEligibleRuns, 1);
    assert.equal(summary.hasMixedEvidence, true);
    assert.equal(summary.publicClaimEligible, false);
  });
});

describe('isClaimEligibleRun hardening', () => {
  function containerRun(overrides: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
      evidence: {
        publicClaimEligible: true,
        executionType: 'real-execution',
        reproducible: true,
        isolated: true,
      },
      environment: { container: true, containerImage: 'node:20-slim', containerId: 'deadbeef1234' },
      usage: { tokenSource: 'provider-reported', confidence: 'exact' },
      validation: { passed: true },
    };
    return { ...base, ...overrides };
  }

  it('rejects forged non-container run claiming isolated:true', () => {
    const run = containerRun({
      environment: { container: false },
      evidence: {
        publicClaimEligible: true,
        executionType: 'real-execution',
        reproducible: true,
        isolated: true,
      },
    });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects container run with empty image string', () => {
    const run = containerRun({ environment: { container: true, containerImage: '', containerId: 'abc' } });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects container run without daemon-issued containerId', () => {
    const run = containerRun({ environment: { container: true, containerImage: 'node:20-slim' } });
    assert.equal(isClaimEligibleRun(run as never), false);
  });

  it('rejects orchestrator error-report shapes', () => {
    const errorReport = {
      runId: 'x',
      scenarioId: 's',
      condition: 'vanilla',
      status: 'error',
      results: { acceptanceRate: 0, criteria: [] },
      tokens: { total: null, source: 'unavailable' },
      timing: { startMs: 0, endMs: 1, durationMs: 1 },
      evidence: { rawDir: '', agentOutput: '', verifierOutput: '' },
      createdAt: new Date().toISOString(),
    };
    assert.equal(isClaimEligibleRun(errorReport as never), false);
  });

  it('still accepts container run with full provenance', () => {
    assert.equal(isClaimEligibleRun(containerRun() as never), true);
  });
});
