/**
 * Paired comparison of vanilla vs. maestro runs.
 * @module metrics/comparison
 */

import type {
  BenchmarkRunReport,
  Condition,
} from '../types/run.js';
import type {
  ComparisonResult,
  PairedRun,
} from '../types/report.js';
import { computeDistribution, pairedTTest } from './statistics.js';

/**
 * Group run reports by scenario into matched vanilla/maestro pairs.
 *
 * Matches runs by `scenarioId` — the first vanilla and first maestro run
 * for each scenario form a pair. Unmatched runs are ignored.
 */
export function groupRunsIntoPairs(
  runs: BenchmarkRunReport[],
): PairedRun[] {
  const byScenario = new Map<string, Map<Condition, BenchmarkRunReport>>();

  for (const run of runs) {
    let condMap = byScenario.get(run.scenarioId);
    if (!condMap) {
      condMap = new Map();
      byScenario.set(run.scenarioId, condMap);
    }
    // Take first run per condition per scenario
    if (!condMap.has(run.condition)) {
      condMap.set(run.condition, run);
    }
  }

  const pairs: PairedRun[] = [];
  for (const [scenarioId, condMap] of byScenario) {
    const vanilla = condMap.get('vanilla');
    const maestro = condMap.get('maestro');
    if (vanilla && maestro) {
      pairs.push({ scenarioId, vanilla, maestro });
    }
  }

  return pairs;
}

/**
 * Computes the winner between two conditions based on:
 * 1. Acceptance rate (higher is better)
 * 2. Tokens per accepted run (lower is better)
 */
function determineWinner(
  vanillaAcceptRate: number,
  maestroAcceptRate: number,
  vanillaMeanTokens: number | null,
  maestroMeanTokens: number | null,
): 'vanilla' | 'maestro' | 'tie' {
  // Acceptance rate is primary
  if (vanillaAcceptRate > maestroAcceptRate) return 'vanilla';
  if (maestroAcceptRate > vanillaAcceptRate) return 'maestro';

  // Tokens per accepted run is secondary (lower is better)
  if (vanillaMeanTokens !== null && maestroMeanTokens !== null) {
    if (vanillaMeanTokens < maestroMeanTokens) return 'vanilla';
    if (maestroMeanTokens < vanillaMeanTokens) return 'maestro';
  }

  return 'tie';
}

/**
 * Performs a paired comparison of vanilla vs. maestro runs.
 *
 * Winner is determined by:
 * 1. Acceptance rate (higher is better)
 * 2. Tokens per accepted run (lower is better)
 *
 * Statistical significance is tested via Welch's t-test on the token counts.
 */
export function comparePairs(pairs: PairedRun[]): ComparisonResult {
  if (pairs.length === 0) {
    return {
      vanillaDistribution: computeDistribution([]),
      maestroDistribution: computeDistribution([]),
      deltaMeanTokens: null,
      deltaRelativeTokens: null,
      winner: 'tie',
      pValue: null,
      significant: false,
      pairCount: 0,
    };
  }

  // Collect per-pair metrics
  const vanillaAcceptedTokens: number[] = [];
  const maestroAcceptedTokens: number[] = [];
  let vanillaAccepted = 0;
  let maestroAccepted = 0;

  for (const pair of pairs) {
    const vAccepted = pair.vanilla.results.accepted === true;
    const mAccepted = pair.maestro.results.accepted === true;

    if (vAccepted) {
      vanillaAccepted++;
      if (pair.vanilla.tokens.total !== null) {
        vanillaAcceptedTokens.push(pair.vanilla.tokens.total);
      }
    }
    if (mAccepted) {
      maestroAccepted++;
      if (pair.maestro.tokens.total !== null) {
        maestroAcceptedTokens.push(pair.maestro.tokens.total);
      }
    }
  }

  const vanillaAcceptRate = vanillaAccepted / pairs.length;
  const maestroAcceptRate = maestroAccepted / pairs.length;

  const vanillaDist = computeDistribution(vanillaAcceptedTokens);
  const maestroDist = computeDistribution(maestroAcceptedTokens);

  // Delta
  const deltaMeanTokens =
    vanillaDist.mean !== 0 || maestroDist.mean !== 0
      ? vanillaDist.mean - maestroDist.mean
      : null;

  const deltaRelativeTokens =
    deltaMeanTokens !== null && vanillaDist.mean !== 0
      ? deltaMeanTokens / vanillaDist.mean
      : null;

  // Statistical significance
  const tTest =
    vanillaAcceptedTokens.length >= 2 && maestroAcceptedTokens.length >= 2
      ? pairedTTest(vanillaAcceptedTokens, maestroAcceptedTokens)
      : { pValue: null, significant: false };

  const winner = determineWinner(
    vanillaAcceptRate,
    maestroAcceptRate,
    vanillaDist.mean,
    maestroDist.mean,
  );

  return {
    vanillaDistribution: vanillaDist,
    maestroDistribution: maestroDist,
    deltaMeanTokens,
    deltaRelativeTokens,
    winner,
    pValue: tTest.pValue ?? null,
    significant: tTest.significant,
    pairCount: pairs.length,
  };
}
