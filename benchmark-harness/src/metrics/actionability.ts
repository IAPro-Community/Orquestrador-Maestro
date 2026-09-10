import type { BenchmarkRunReport, Condition } from '../types/run.js';

export interface ActionabilityMetrics {
  tokensToFirstAction: number | null;
  nextActionPresent: boolean;
  unnecessaryProseRatio: number;
  stateAccuracy: number;
  completionEvidencePresent: boolean;
  errorActionability: number;
  contextReorientationTokens: number;
}

export interface ActionabilitySummary {
  condition: Condition;
  samples: number;
  mean: Omit<ActionabilityMetrics, 'nextActionPresent' | 'completionEvidencePresent'> & {
    nextActionPresent: number;
    completionEvidencePresent: number;
  };
}

const ACTION = /\b(?:implement|fix|run|verify|create|update|remove|inspect|execute|corrija|implemente|rode|verifique|crie|atualize|remova|inspecione)\b/i;
const NEXT = /\b(?:next action|next step|próxima ação|próximo passo|next)\b/i;
const STATE = /\b(?:status|state|current|phase|progress|fase|progresso|atual)\b/i;
const EVIDENCE = /\b(?:evidence|evidência|test|teste|verified|verificado|diff|artifact|artefato)\b/i;

function words(value: string): string[] { return value.trim().split(/\s+/u).filter(Boolean); }
function outputOf(run: BenchmarkRunReport): string { return [run.evidence.agentOutput, run.evidence.verifierOutput].filter(Boolean).join('\n'); }

export function measureActionability(run: BenchmarkRunReport): ActionabilityMetrics {
  const output = outputOf(run); const lines = output.split(/\r?\n/u).filter((line) => line.trim());
  const actionIndex = lines.findIndex((line) => ACTION.test(line));
  const firstAction = actionIndex < 0 ? null : words(lines.slice(0, actionIndex + 1).join(' ')).length;
  const proseLines = lines.filter((line) => !ACTION.test(line) && !NEXT.test(line) && !STATE.test(line)).length;
  const stateLines = lines.filter((line) => STATE.test(line)).length;
  const contextLines = lines.filter((line) => /\b(?:context|workspace|repository|codebase|contexto|workspace|repositório|codebase)\b/i.test(line)).length;
  const changed = (run.evidence.filesChanged?.length ?? 0) > 0 || Boolean(run.evidence.gitDiff?.trim());
  return {
    tokensToFirstAction: firstAction,
    nextActionPresent: NEXT.test(output),
    unnecessaryProseRatio: lines.length ? proseLines / lines.length : 0,
    stateAccuracy: STATE.test(output) ? Math.min(1, stateLines / Math.max(1, Math.ceil(lines.length / 4))) : 0,
    completionEvidencePresent: run.results.accepted === true ? changed || EVIDENCE.test(output) : false,
    errorActionability: run.status === 'passed' ? 1 : EVIDENCE.test(output) && NEXT.test(output) ? 1 : 0,
    contextReorientationTokens: words(lines.filter((line) => /\b(?:context|workspace|repository|codebase|contexto|repositório)\b/i.test(line)).join(' ')).length,
  };
}

export function summarizeActionability(runs: BenchmarkRunReport[]): Record<Condition, ActionabilitySummary> {
  const grouped = new Map<Condition, BenchmarkRunReport[]>();
  for (const run of runs) { const list = grouped.get(run.condition) ?? []; list.push(run); grouped.set(run.condition, list); }
  const result = {} as Record<Condition, ActionabilitySummary>;
  for (const [condition, conditionRuns] of grouped) {
    const values = conditionRuns.map(measureActionability); const average = (key: keyof ActionabilityMetrics) => values.reduce((sum, value) => sum + (typeof value[key] === 'boolean' ? (value[key] ? 1 : 0) : (value[key] ?? 0)), 0) / values.length;
    result[condition] = { condition, samples: values.length, mean: {
      tokensToFirstAction: average('tokensToFirstAction'), nextActionPresent: average('nextActionPresent'), unnecessaryProseRatio: average('unnecessaryProseRatio'), stateAccuracy: average('stateAccuracy'), completionEvidencePresent: average('completionEvidencePresent'), errorActionability: average('errorActionability'), contextReorientationTokens: average('contextReorientationTokens')
    } };
  }
  return result;
}
