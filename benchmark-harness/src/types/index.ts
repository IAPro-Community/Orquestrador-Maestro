/**
 * Public type exports for `@benchmark-harness/types`.
 *
 * @module types
 */

// Token usage and provenance
export {
  TokenConfidence,
  TokenSource,
  type TokenUsage,
} from './tokens.js';

// Scenario definition
export type {
  Acceptance,
  AcceptanceCriterion,
  BenchmarkScenario,
  CriterionType,
  FixtureRef,
  ScenarioIntegrity,
  ScenarioLimits,
} from './scenario.js';

// Run report
export type {
  BenchmarkRunReport,
  Condition,
  CriterionResult,
  RunDriver,
  RunEvidence,
  RunEnvironment,
  RunFixture,
  RunResults,
  RunStatus,
  RunTiming,
} from './run.js';

// Evidence model
export type {
  EvidenceFile,
  FilesystemEvidence,
  GitEvidence,
  RunEvidenceBundle,
} from './evidence.js';

// Final benchmark report
export type {
  BenchmarkClaim,
  BenchmarkEnvironment,
  BenchmarkMethodology,
  BenchmarkReport,
  BenchmarkSummary,
  Distribution,
  PairDelta,
  PairWinner,
  PairedComparison,
  ReportScenario,
  RunSummary,
} from './report.js';

// Agent driver
export type {
  AgentDriver,
  DriverExecuteOptions,
  DriverResult,
} from './driver.js';

export type { ActionabilityMetrics, ActionabilitySummary } from './metrics.js';
