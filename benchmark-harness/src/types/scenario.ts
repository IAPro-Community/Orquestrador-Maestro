/**
 * Scenario types matching the JSON Schema at `schemas/scenario.json`.
 * @module scenario
 */

/** Acceptance criterion type discriminators. */
export type CriterionType =
  | 'hidden_tests'
  | 'build'
  | 'typecheck'
  | 'existing_tests'
  | 'lint'
  | 'integrity'
  | 'filesystem'
  | 'custom';

/** A single acceptance criterion that must pass for the scenario to be accepted. */
export interface AcceptanceCriterion {
  /** Discriminator for the criterion kind. */
  type: CriterionType;
  /** Human-readable name of the criterion. */
  name: string;
  /** Shell command to evaluate (when applicable). */
  command?: string;
  /** Longer description of what this criterion checks. */
  description?: string;
  /** Wall-clock timeout in seconds (default 120). */
  timeout?: number;
}

/** Acceptance block: an ordered list of criteria ALL of which must pass. */
export interface Acceptance {
  /** Ordered criteria — all must pass. */
  criteria: AcceptanceCriterion[];
  /** Path to hidden test directory (inaccessible to the agent under test). */
  hiddenTestPath?: string;
}

/** Fixture reference pointing at a golden directory. */
export interface FixtureRef {
  /** Relative path to the golden fixture directory. */
  path: string;
  /** SHA-256 hash of fixture contents (computed at runtime). */
  hash?: string;
}

/** Resource and time limits for a scenario run. */
export interface ScenarioLimits {
  /** Token budget cap. */
  maxTokens?: number;
  /** Wall-clock timeout in milliseconds. */
  maxTimeMs?: number;
  /** Number of retry attempts (default 1). */
  maxRetries?: number;
}

/** Expected integrity hashes for deterministic verification. */
export interface ScenarioIntegrity {
  /** SHA-256 of the hidden test suite. */
  hiddenTestsHash?: string;
  /** SHA-256 of the verifier script. */
  verifierHash?: string;
  /** SHA-256 of the scenario definition itself. */
  scenarioHash?: string;
}

/** A single benchmark scenario. */
export interface BenchmarkScenario {
  /** Unique identifier (kebab-case). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** What this scenario measures. */
  description?: string;
  /** The exact prompt / instruction given to the agent. */
  task: string;
  /** Golden fixture reference. */
  fixture: FixtureRef;
  /** Acceptance criteria. */
  acceptance: Acceptance;
  /** Resource and time limits. */
  limits: ScenarioLimits;
  /** Model identifier (e.g. `'claude-sonnet-4-20250514'`). */
  model?: string;
  /** Tags for filtering scenarios. */
  tags?: string[];
  /** Expected integrity hashes. */
  integrity?: ScenarioIntegrity;
  /** SHA-256 of the task prompt — computed at load/validation time. */
  taskHash?: string;
}
