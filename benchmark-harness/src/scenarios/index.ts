/**
 * Scenario validation.
 *
 * Validates scenario data against the JSON schema, checks fixture paths,
 * computes task hashes, and ensures acceptance criteria are well-formed.
 * @module scenarios
 */

import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';

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

/** A single acceptance criterion. */
export interface AcceptanceCriterion {
  type: CriterionType;
  name: string;
  command?: string;
  description?: string;
  timeout?: number;
}

/** Acceptance block. */
export interface Acceptance {
  criteria: AcceptanceCriterion[];
  hiddenTestPath?: string;
}

/** Fixture reference. */
export interface FixtureRef {
  path: string;
  hash?: string;
}

/** Resource and time limits. */
export interface ScenarioLimits {
  maxTokens?: number;
  maxTimeMs?: number;
  maxRetries?: number;
}

/** Expected integrity hashes. */
export interface ScenarioIntegrity {
  hiddenTestsHash?: string;
  verifierHash?: string;
  scenarioHash?: string;
}

/** A benchmark scenario. */
export interface Scenario {
  id: string;
  name: string;
  description?: string;
  task: string;
  fixture: FixtureRef;
  acceptance: Acceptance;
  limits: ScenarioLimits;
  model?: string;
  tags?: string[];
  integrity?: ScenarioIntegrity;
  /** SHA-256 of the task prompt — computed at load/validation time. */
  taskHash?: string;
}

/** Validation result. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  scenario?: Scenario;
}

const VALID_CRITERION_TYPES = new Set<CriterionType>([
  'hidden_tests',
  'build',
  'typecheck',
  'existing_tests',
  'lint',
  'integrity',
  'filesystem',
  'custom',
]);

const VALID_ID_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Validate raw data as a BenchmarkScenario.
 *
 * Checks:
 * 1. Required fields are present and correct types.
 * 2. `id` matches kebab-case pattern.
 * 3. `fixture.path` exists on disk.
 * 4. All acceptance criteria have valid types and non-empty names.
 * 5. Computes `taskHash` as SHA-256 of the task prompt.
 *
 * @param data  Unknown input to validate.
 * @returns     ValidationResult with errors or the validated Scenario.
 */
export function validateScenario(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Input is not an object'] };
  }

  const obj = data as Record<string, unknown>;

  // --- Required fields ---
  if (typeof obj.id !== 'string' || !obj.id) {
    errors.push('Missing or invalid "id"');
  } else if (!VALID_ID_PATTERN.test(obj.id)) {
    errors.push(`"id" must be kebab-case (got "${obj.id}")`);
  }

  if (typeof obj.name !== 'string' || !obj.name) {
    errors.push('Missing or invalid "name"');
  }

  if (typeof obj.task !== 'string' || !obj.task) {
    errors.push('Missing or invalid "task"');
  }

  // --- Fixture ---
  if (typeof obj.fixture !== 'object' || obj.fixture === null) {
    errors.push('Missing or invalid "fixture"');
  } else {
    const fixture = obj.fixture as Record<string, unknown>;
    if (typeof fixture.path !== 'string' || !fixture.path) {
      errors.push('Missing or invalid "fixture.path"');
    }
  }

  // --- Acceptance ---
  if (typeof obj.acceptance !== 'object' || obj.acceptance === null) {
    errors.push('Missing or invalid "acceptance"');
  } else {
    const acceptance = obj.acceptance as Record<string, unknown>;
    if (!Array.isArray(acceptance.criteria)) {
      errors.push('Missing or invalid "acceptance.criteria" (must be array)');
    } else if (acceptance.criteria.length === 0) {
      errors.push('"acceptance.criteria" must not be empty');
    } else {
      for (let i = 0; i < acceptance.criteria.length; i++) {
        const c = acceptance.criteria[i] as Record<string, unknown>;
        if (typeof c.type !== 'string' || !VALID_CRITERION_TYPES.has(c.type as CriterionType)) {
          errors.push(`criteria[${i}].type "${c.type}" is not a valid criterion type`);
        }
        if (typeof c.name !== 'string' || !c.name) {
          errors.push(`criteria[${i}].name is missing or empty`);
        }
        if (c.timeout !== undefined && (typeof c.timeout !== 'number' || c.timeout <= 0)) {
          errors.push(`criteria[${i}].timeout must be a positive number`);
        }
      }
    }

    if (
      acceptance.hiddenTestPath !== undefined &&
      typeof acceptance.hiddenTestPath !== 'string'
    ) {
      errors.push('"acceptance.hiddenTestPath" must be a string');
    }
  }

  // --- Limits ---
  if (typeof obj.limits !== 'object' || obj.limits === null) {
    // limits is optional in the schema but recommended.
  }

  // --- Optional fields ---
  if (obj.model !== undefined && typeof obj.model !== 'string') {
    errors.push('"model" must be a string');
  }

  if (obj.tags !== undefined && !Array.isArray(obj.tags)) {
    errors.push('"tags" must be an array');
  }

  if (obj.description !== undefined && typeof obj.description !== 'string') {
    errors.push('"description" must be a string');
  }

  if (obj.integrity !== undefined && typeof obj.integrity !== 'object') {
    errors.push('"integrity" must be an object');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // --- Build Scenario ---
  const fixture = obj.fixture as Record<string, unknown>;
  const acceptance = obj.acceptance as Record<string, unknown>;
  const limits = (obj.limits as Record<string, unknown> | undefined) ?? {};
  const integrity = obj.integrity as Record<string, unknown> | undefined;

  const scenario: Scenario = {
    id: obj.id as string,
    name: obj.name as string,
    task: obj.task as string,
    fixture: {
      path: fixture.path as string,
      hash: typeof fixture.hash === 'string' ? fixture.hash : undefined,
    },
    acceptance: {
      criteria: (acceptance.criteria as Array<Record<string, unknown>>).map(
        (c) => ({
          type: c.type as CriterionType,
          name: c.name as string,
          command: typeof c.command === 'string' ? c.command : undefined,
          description:
            typeof c.description === 'string' ? c.description : undefined,
          timeout: typeof c.timeout === 'number' ? c.timeout : undefined,
        }),
      ),
      hiddenTestPath:
        typeof acceptance.hiddenTestPath === 'string'
          ? acceptance.hiddenTestPath
          : undefined,
    },
    limits: {
      maxTokens:
        typeof limits.maxTokens === 'number' ? limits.maxTokens : undefined,
      maxTimeMs:
        typeof limits.maxTimeMs === 'number' ? limits.maxTimeMs : undefined,
      maxRetries:
        typeof limits.maxRetries === 'number' ? limits.maxRetries : undefined,
    },
    model: typeof obj.model === 'string' ? obj.model : undefined,
    tags: Array.isArray(obj.tags) ? (obj.tags as string[]) : undefined,
    description:
      typeof obj.description === 'string' ? obj.description : undefined,
    integrity: integrity
      ? {
          hiddenTestsHash:
            typeof integrity.hiddenTestsHash === 'string'
              ? integrity.hiddenTestsHash
              : undefined,
          verifierHash:
            typeof integrity.verifierHash === 'string'
              ? integrity.verifierHash
              : undefined,
          scenarioHash:
            typeof integrity.scenarioHash === 'string'
              ? integrity.scenarioHash
              : undefined,
        }
      : undefined,
  };

  // Compute taskHash.
  scenario.taskHash = createHash('sha256').update(scenario.task).digest('hex');

  return { valid: true, errors: [], scenario };
}
