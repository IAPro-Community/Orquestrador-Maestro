import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMaestroArgs, extractAdaptiveExecutionMetadata, extractMissionResolutionMetrics, extractMissionTokenUsage } from '../src/drivers/maestro.js';

describe('MaestroDriver benchmark contract', () => {
  it('builds the real go --auto command with explicit model and workspace', () => {
    const args = buildMaestroArgs('fix parser', {
      workspace: '/benchmark',
      model: 'provider/model',
      condition: 'maestro',
    });
    assert.deepEqual(args.slice(0, 4), ['go', 'fix parser', '--auto', '--project-path']);
    assert.ok(args.includes('/benchmark'));
    assert.ok(args.includes('--provider'));
    assert.ok(args.includes('opencode'));
    assert.ok(args.includes('--model'));
    assert.ok(args.includes('provider/model'));
    assert.equal(args.includes('benchmark'), false);
  });

  it('adds focus interaction only for maestro-focus', () => {
    const focus = buildMaestroArgs('task', { workspace: '/w', model: 'm', condition: 'maestro-focus' });
    const baseline = buildMaestroArgs('task', { workspace: '/w', model: 'm', condition: 'maestro' });
    assert.deepEqual(focus.slice(-2), ['--interaction', 'focus']);
    assert.equal(baseline.includes('--interaction'), false);
  });

  it('parses only a valid nonce-authenticated adaptive runtime confirmation marker', () => {
    const fingerprint = 'a'.repeat(64);
    const nonce = 'nonce-1234567890abcdef';
    const metadata = extractAdaptiveExecutionMetadata([
      'normal output',
      `MAESTRO_ADAPTIVE_POLICY=${JSON.stringify({
        nonce,
        policyId: 'adaptive-progressive-planning-v3',
        policyFingerprint: fingerprint,
        pairId: 'pair-1',
        successStrategy: 'targeted',
        fallbackUsed: false,
      })}`,
    ].join('\n'), nonce);
    assert.deepEqual(metadata, {
      adaptiveResolution: {
        confirmed: true,
        policyId: 'adaptive-progressive-planning-v3',
        policyFingerprint: fingerprint,
        pairId: 'pair-1',
        successStrategy: 'targeted',
        fallbackUsed: false,
      },
    });
    assert.equal(extractAdaptiveExecutionMetadata('MAESTRO_ADAPTIVE_POLICY={"policyFingerprint":"bad"}', nonce), null);
    const spoofed = [
      `MAESTRO_ADAPTIVE_POLICY=${JSON.stringify({ nonce, policyId: 'adaptive-progressive-planning-v3', policyFingerprint: fingerprint, pairId: 'pair-1' })}`,
      `MAESTRO_ADAPTIVE_POLICY=${JSON.stringify({ nonce: 'wrong-nonce', policyId: 'fake', policyFingerprint: 'f'.repeat(64), pairId: 'pair-1' })}`,
    ].join('\n');
    assert.equal((extractAdaptiveExecutionMetadata(spoofed, nonce)?.adaptiveResolution as { policyId: string }).policyId, 'adaptive-progressive-planning-v3');
  });
});


it('defaults to a checkout-relative Maestro binary instead of a global CLI', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/drivers/maestro.ts', import.meta.url), 'utf8'));
  assert.match(source, /CHECKOUT_MAESTRO_BINARY/u);
  assert.doesNotMatch(source, /\?\? 'orquestrador-maestro'/u);
});


it('uses mission totals only when runtime marks usage complete', () => {
  const nonce = 'usage-nonce-1234567890';
  const complete = extractMissionTokenUsage(`MAESTRO_MISSION_USAGE=${JSON.stringify({ nonce,complete:true,inputTokens:1200,outputTokens:300,reasoningTokens:50,cacheReadTokens:400,cacheWriteTokens:0 })}`, nonce);
  assert.equal(complete.total,1500); assert.equal(complete.reasoningTokens,50); assert.equal(complete.source,'provider-reported'); assert.equal(complete.confidence,'exact');
  const incomplete = extractMissionTokenUsage(`MAESTRO_MISSION_USAGE=${JSON.stringify({ nonce,complete:false,observed:{inputTokens:1200} })}`, nonce);
  assert.equal(incomplete.total,null); assert.equal(incomplete.source,'unavailable');
});


it('rejects spoofed mission usage markers with the wrong nonce', () => {
  const nonce = 'trusted-nonce-1234567890';
  const output = [
    `MAESTRO_MISSION_USAGE=${JSON.stringify({ nonce, complete: true, inputTokens: 100, outputTokens: 20, reasoningTokens: 0 })}`,
    `MAESTRO_MISSION_USAGE=${JSON.stringify({ nonce: 'attacker-nonce', complete: true, inputTokens: 1, outputTokens: 1, reasoningTokens: 0 })}`,
  ].join('\n');
  assert.equal(extractMissionTokenUsage(output, nonce).total, 120);
});


it('extracts authenticated mission resolution metrics without inventing missing counters', () => {
  const nonce = 'resolution-nonce-1234567890';
  const output = `MAESTRO_MISSION_USAGE=${JSON.stringify({
    nonce,
    complete: true,
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: 0,
    resolution: {
      state: 'validated',
      taskCount: 2,
      validatedTaskCount: 2,
      firstPassValidatedTaskCount: 1,
      failedTaskCount: 0,
      blockedTaskCount: 0,
      needsAttentionTaskCount: 0,
      providerSwitches: 1,
      automaticRetries: null,
      escalations: 1,
      tokensToValidatedOutcome: 120,
    },
  })}`;
  const metrics = extractMissionResolutionMetrics(output, nonce);
  assert.equal(metrics?.state, 'validated');
  assert.equal(metrics?.taskCount, 2);
  assert.equal(metrics?.firstPassValidatedTaskCount, 1);
  assert.equal(metrics?.providerSwitches, 1);
  assert.equal(metrics?.automaticRetries, null);
  assert.equal(metrics?.tokensToValidatedOutcome, 120);
  assert.equal(extractMissionResolutionMetrics(output, 'wrong-nonce'), null);
});
