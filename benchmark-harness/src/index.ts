/**
 * Benchmark Harness v3 — public API.
 *
 * @module benchmark-harness
 */

// Types
export type {
  AgentDriver,
  DriverExecuteOptions,
  DriverResult,
  ToolUsage,
} from './types/driver.js';
export type {
  BenchmarkScenario,
  Acceptance,
  AcceptanceCriterion,
  CriterionType,
  FixtureRef,
  ScenarioLimits,
  ScenarioIntegrity,
} from './types/scenario.js';
export type {
  BenchmarkRunReport,
  Condition,
  RunStatus,
  CriterionResult,
  RunResults,
  RunTiming,
  RunEvidence,
} from './types/run.js';
export type {
  BenchmarkReport,
  PairedComparison,
  Distribution,
} from './types/report.js';
export type {
  TokenUsage,
} from './types/tokens.js';
export { TokenSource, TokenConfidence } from './types/tokens.js';

// Core modules
export { OpenCodeDriver } from './drivers/opencode.js';
export { MaestroDriver } from './drivers/maestro.js';
export { ContainerRunner, verifyContainerIsolation } from './container/runner.js';
export { orchestrateRun, orchestratePair } from './orchestrator/index.js';
export { verifyAcceptanceSuite } from './verifier/index.js';
export { checkBenchmarkIntegrity } from './verifier/integrity.js';
export { validateScenario } from './scenarios/index.js';
export { loadScenario, loadAllScenarios } from './scenarios/loader.js';
export { hashFixture, copyFixtureToTemp } from './fixtures/index.js';
export { createEvidenceDir, preserveRawEvidence, sanitizeSecrets } from './evidence/index.js';
export { generateMarkdownReport, formatToolUsageTable } from './reporter/markdown.js';
export { generateJSONReport } from './reporter/json.js';
export { generateCsvReport } from './reporter/csv.js';
export {
  generateAcceptanceBarChart,
  generateTokenBoxPlot,
  generateDurationTimeline,
} from './reporter/charts.js';
export { sumTokenUsage, cumulativeTokensToFirstSuccess } from './metrics/tokens.js';
export { computeDistribution, welchTTest } from './metrics/statistics.js';
export { comparePairs } from './metrics/comparison.js';
export { reconcileTokenUsage, validateTokenUsage } from './metrics/reconciliation.js';
export { measureActionability, summarizeActionability } from './metrics/actionability.js';
export type { ActionabilityMetrics, ActionabilitySummary } from './metrics/actionability.js';
export { TokenizerRegistry } from './metrics/tokenizer-registry.js';
export type { TokenEstimate, Tokenizer } from './metrics/tokenizer-registry.js';
