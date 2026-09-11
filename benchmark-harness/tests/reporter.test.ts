import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateMarkdownReport } from '../src/reporter/markdown.js';
import { generateJSONReport } from '../src/reporter/json.js';
import type { BenchmarkReport } from '../src/types/report.js';

function makeReport(overrides: Partial<BenchmarkReport> = {}): BenchmarkReport {
  return {
    benchmarkId: 'bench-001',
    version: '3',
    createdAt: '2026-01-01T00:00:00.000Z',
    methodology: {
      description: 'Test methodology',
      containerRequired: false,
      externalVerifier: true,
    },
    scenarios: [],
    pairs: [],
    summary: {
      totalRuns: 4,
      vanillaRuns: 2,
      maestroRuns: 2,
      acceptanceRates: { vanilla: 0.5, maestro: 1.0 },
    },
    claims: [],
    limitations: ['Small sample size'],
    ...overrides,
  };
}

describe('generateMarkdownReport', () => {
  it('returns a string', () => {
    const report = makeReport();
    const md = generateMarkdownReport(report);
    assert.equal(typeof md, 'string');
    assert.ok(md.length > 0);
  });

  it('includes benchmark ID as title', () => {
    const report = makeReport({ benchmarkId: 'bench-xyz' });
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('# Benchmark Report: bench-xyz'));
  });

  it('includes methodology section', () => {
    const md = generateMarkdownReport(makeReport());
    assert.ok(md.includes('## Methodology'));
    assert.ok(md.includes('Test methodology'));
  });

  it('includes acceptance rates BEFORE tokens', () => {
    const md = generateMarkdownReport(makeReport());
    const acceptanceIdx = md.indexOf('## Acceptance Rates');
    const tokensIdx = md.indexOf('## Token Metrics');
    assert.ok(acceptanceIdx > 0, 'Acceptance Rates section exists');
    assert.ok(tokensIdx > 0, 'Token Metrics section exists');
    assert.ok(acceptanceIdx < tokensIdx, 'Acceptance Rates appears before Token Metrics');
  });

  it('includes acceptance rate values', () => {
    const md = generateMarkdownReport(makeReport());
    assert.ok(md.includes('Vanilla'));
    assert.ok(md.includes('Maestro'));
  });

  it('includes limitations', () => {
    const md = generateMarkdownReport(makeReport());
    assert.ok(md.includes('## Limitations'));
    assert.ok(md.includes('Small sample size'));
  });

  it('includes environment when present', () => {
    const report = makeReport({
      environment: { os: 'linux', arch: 'x86_64', nodeVersion: '20.0.0' },
    });
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('## Environment'));
    assert.ok(md.includes('linux'));
  });

  it('includes paired comparisons when present', () => {
    const report = makeReport({
      pairs: [
        {
          pairId: 'p1',
          scenarioId: 's1',
          vanilla: {
            runId: 'v1',
            status: 'passed',
            accepted: true,
            tokens: 150,
            durationMs: 1000,
            acceptanceRate: 1.0,
          },
          maestro: {
            runId: 'm1',
            status: 'passed',
            accepted: true,
            tokens: 100,
            durationMs: 800,
            acceptanceRate: 1.0,
          },
          delta: {
            tokensAbsolute: 50,
            tokensRelative: 0.33,
            durationAbsolute: 200,
            durationRelative: 0.2,
            winner: 'maestro',
          },
        },
      ],
    });
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('## Paired Comparisons'));
    assert.ok(md.includes('Winner: maestro'));
  });

  it('shows distribution data (never only mean)', () => {
    const report = makeReport({
      summary: {
        totalRuns: 4,
        vanillaRuns: 2,
        maestroRuns: 2,
        acceptanceRates: { vanilla: 0.5, maestro: 1.0 },
        tokensPerAcceptedRun: {
          vanilla: {
            n: 1,
            mean: 150,
            median: 150,
            stddev: 0,
            p25: 150,
            p75: 150,
            p90: 150,
            p95: 150,
            ci95Lower: null,
            ci95Upper: null,
          },
          maestro: {
            n: 2,
            mean: 125,
            median: 125,
            stddev: 35.35,
            p25: 125,
            p75: 125,
            p90: 125,
            p95: 125,
            ci95Lower: 100,
            ci95Upper: 150,
          },
        },
      },
    });
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('mean:'));
    assert.ok(md.includes('median:'));
    assert.ok(md.includes('stddev:'));
    assert.ok(md.includes('p25:'));
    assert.ok(md.includes('CI95:'));
  });

  it('shows CI95 note for small samples', () => {
    const report = makeReport({
      summary: {
        totalRuns: 2,
        vanillaRuns: 1,
        maestroRuns: 1,
        acceptanceRates: { vanilla: 1.0, maestro: 1.0 },
        tokensPerAcceptedRun: {
          vanilla: {
            n: 1,
            mean: 150,
            median: 150,
            stddev: 0,
            p25: 150,
            p75: 150,
            p90: 150,
            p95: 150,
            ci95Lower: null,
            ci95Upper: null,
          },
        },
      },
    });
    const md = generateMarkdownReport(report);
    assert.ok(md.includes('insufficient data'));
  });
});

describe('generateJSONReport', () => {
  it('returns valid JSON', () => {
    const report = makeReport();
    const json = generateJSONReport(report);
    const parsed = JSON.parse(json);
    assert.equal(parsed.benchmarkId, 'bench-001');
    assert.equal(parsed.version, '3');
  });

  it('preserves all fields', () => {
    const report = makeReport({
      claims: [{ metric: 'tokens', vanilla: 100, maestro: 80, significant: true }],
    });
    const json = generateJSONReport(report);
    const parsed = JSON.parse(json);
    assert.equal(parsed.claims.length, 1);
    assert.equal(parsed.claims[0].metric, 'tokens');
  });

  it('is pretty-printed', () => {
    const json = generateJSONReport(makeReport());
    assert.ok(json.includes('\n'));
    assert.ok(json.includes('  '));
  });
});
