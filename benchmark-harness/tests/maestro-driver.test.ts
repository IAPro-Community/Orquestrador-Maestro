import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMaestroArgs, extractAdaptiveExecutionMetadata, extractMissionTokenUsage } from '../src/drivers/maestro.js';

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

  it('parses only a valid adaptive runtime confirmation marker', () => {
    const fingerprint = 'a'.repeat(64);
    const metadata = extractAdaptiveExecutionMetadata([
      'normal output',
      `MAESTRO_ADAPTIVE_POLICY=${JSON.stringify({
        policyId: 'adaptive-progressive-planning-v3',
        policyFingerprint: fingerprint,
        pairId: 'pair-1',
        successStrategy: 'targeted',
        fallbackUsed: false,
      })}`,
    ].join('\n'));
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
    assert.equal(extractAdaptiveExecutionMetadata('MAESTRO_ADAPTIVE_POLICY={"policyFingerprint":"bad"}'), null);
  });
});


it('defaults to a checkout-relative Maestro binary instead of a global CLI', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../src/drivers/maestro.ts', import.meta.url), 'utf8'));
  assert.match(source, /CHECKOUT_MAESTRO_BINARY/u);
  assert.doesNotMatch(source, /\?\? 'orquestrador-maestro'/u);
});


it('uses mission totals only when runtime marks usage complete', () => {
  const complete = extractMissionTokenUsage(`MAESTRO_MISSION_USAGE=${JSON.stringify({ complete:true,inputTokens:1200,outputTokens:300,reasoningTokens:50,cacheReadTokens:400,cacheWriteTokens:0 })}`);
  assert.equal(complete.total,1550); assert.equal(complete.source,'provider-reported'); assert.equal(complete.confidence,'exact');
  const incomplete = extractMissionTokenUsage(`MAESTRO_MISSION_USAGE=${JSON.stringify({ complete:false,observed:{inputTokens:1200} })}`);
  assert.equal(incomplete.total,null); assert.equal(incomplete.source,'unavailable');
});
