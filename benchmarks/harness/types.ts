export type ScenarioType = "bug" | "feature" | "refactor" | "investigation" | "migration";
export type BenchmarkCondition = "vanilla" | "maestro-core";
export type TokenSource =
  | "provider-reported"
  | "opencode-native"
  | "session-derived"
  | "tokenizer-exact"
  | "tokenizer-estimated"
  | "not-applicable"
  | "unavailable"
  | "unknown";
export type ExecutionType = "real-execution" | "synthetic" | "infrastructure";

export interface Scenario {
  id: string;
  name: string;
  type: ScenarioType;
  description: string;
  prompt: string;
  fixtureDir: string;
  hiddenTests?: string;
  acceptance: string[];
  validation: ValidationConfig;
  expectedInvariants?: string[];
}

export interface ValidationConfig {
  command: string;
  expectedExitCode: number;
  timeoutMs?: number;
}

export interface RunOptions {
  condition: BenchmarkCondition;
  model: string;
  variant?: string;
  timeoutMs?: number;
  workDir: string;
  useContainer?: boolean;
  env?: Record<string, string>;
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  tokenSource: TokenSource;
  confidence?: number;
}

export interface ToolUsage {
  calls: number;
  filesRead: number;
  filesModified: number;
  filesCreated: number;
  filesDeleted: number;
}

export interface DriverResult {
  success: boolean;
  error: string | null;
  usage: TokenUsage;
  durationMs: number;
  tools: ToolUsage;
  evidence: {
    executionType: ExecutionType;
    reproducible: boolean;
    isolated: boolean;
  };
  stdout?: string;
  session?: Record<string, unknown>;
}

export interface ValidationResult {
  passed: boolean;
  exitCode: number;
  testsPassed: number;
  testsFailed: number;
  testsTotal: number;
  output: string;
}

export interface EvidenceGate {
  realExecution: boolean;
  providerReportedTokens: boolean;
  hiddenTestsPass: boolean;
  expectedExitCode: boolean;
  isolated: boolean;
  reproducible: boolean;
  publicClaimEligible: boolean;
  evaluatedAt: string;
}

export interface RunResult {
  benchmark: string;
  condition: BenchmarkCondition;
  run: number;
  model: string;
  driver: string;
  repoCommit: string;
  promptHash: string;
  environment: {
    os: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    timestamp: string;
  };
  driverResult: DriverResult;
  validation: ValidationResult;
  evidence: {
    passed: boolean;
    testsPassed: number;
    testsTotal: number;
    errors: string[];
    publicClaimEligible: boolean;
    executionType?: ExecutionType;
    reproducible?: boolean;
    isolated?: boolean;
  };
  metadata: {
    durationMs: number;
    retries: number;
    notes: string;
  };
}

export interface StatisticalSummary {
  median: number | null;
  mean: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  min: number | null;
  max: number | null;
  ci95: { lower: number | null; upper: number | null };
  stddev: number | null;
}

export interface MannWhitneyResult {
  u: number;
  p: number;
  significant: boolean;
  n1: number;
  n2: number;
  alpha: number;
}

export interface WelchTResult {
  t: number;
  df: number;
  p: number;
  significant: boolean;
  n1: number;
  n2: number;
  alpha: number;
}

export interface OutlierResult {
  values: number[];
  outliers: number[];
  method: string;
  lowerBound: number;
  upperBound: number;
}

export interface ToolUsageComparison {
  calls: { vanilla: number; maestro: number; delta: number; pctChange: number | null };
  filesRead: { vanilla: number; maestro: number; delta: number; pctChange: number | null };
  filesModified: { vanilla: number; maestro: number; delta: number; pctChange: number | null };
  filesCreated: { vanilla: number; maestro: number; delta: number; pctChange: number | null };
  filesDeleted: { vanilla: number; maestro: number; delta: number; pctChange: number | null };
}

export interface StatisticalTestResult {
  mannWhitneyU: MannWhitneyResult | null;
  welchTTest: WelchTResult | null;
}

export interface AggregatedMetrics {
  n: number;
  successRate: number;
  tokens: StatisticalSummary;
  duration: StatisticalSummary;
}

export interface ComparisonResult {
  scenarioId: string;
  vanilla: AggregatedMetrics;
  maestro: AggregatedMetrics;
  delta: {
    tokensMedianDelta: number | null;
    tokensMedianPctChange: number | null;
    tokensMeanDelta: number | null;
    tokensMeanPctChange: number | null;
    durationMedianDelta: number | null;
    durationMedianPctChange: number | null;
    durationMeanDelta: number | null;
    durationMeanPctChange: number | null;
    successRateDelta: number;
  };
  statisticalTests: StatisticalTestResult;
  outlierDetection: {
    tokens: OutlierResult;
    duration: OutlierResult;
  } | null;
  toolUsage: ToolUsageComparison | null;
  note: string;
}

export interface BenchmarkReport {
  meta: {
    generatedAt: string;
    repoCommit: string;
    model: string;
    driver: string;
  };
  comparisons: ComparisonResult[];
  results: RunResult[];
  evidenceGate: {
    totalRuns: number;
    claimEligibleRuns: number;
    hasMixedEvidence: boolean;
    publicClaimEligible: boolean;
  };
}
