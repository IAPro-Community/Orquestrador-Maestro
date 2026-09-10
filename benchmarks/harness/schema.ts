import type { Scenario, RunResult } from "./types";

const VALID_CONDITIONS = ["vanilla", "maestro-core"];
const VALID_EXECUTION_TYPES = ["real-execution", "synthetic", "infrastructure"];
const VALID_TOKEN_SOURCES = [
  "provider-reported",
  "opencode-native",
  "session-derived",
  "tokenizer-exact",
  "tokenizer-estimated",
  "not-applicable",
  "unavailable",
  "unknown",
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateRunResult(result: unknown): ValidationResult {
  const r = result as Record<string, unknown>;
  const errors: string[] = [];

  if (!r.benchmark || typeof r.benchmark !== "string") {
    errors.push("benchmark: required string");
  }
  if (!VALID_CONDITIONS.includes(r.condition as string)) {
    errors.push(`condition: must be one of ${VALID_CONDITIONS.join(", ")}`);
  }
  if (!Number.isInteger(r.run) || (r.run as number) < 1) {
    errors.push("run: must be positive integer");
  }
  if (!r.model || typeof r.model !== "string") {
    errors.push("model: required string");
  }
  if (!r.driver || typeof r.driver !== "string") {
    errors.push("driver: required string");
  }
  if (!r.repoCommit || typeof r.repoCommit !== "string") {
    errors.push("repoCommit: required string");
  }
  if (!r.promptHash || typeof r.promptHash !== "string") {
    errors.push("promptHash: required string");
  }
  if (!r.environment || typeof r.environment !== "object") {
    errors.push("environment: required object");
  }
  if (!r.driverResult || typeof r.driverResult !== "object") {
    errors.push("driverResult: required object");
  }
  if (!r.validation || typeof r.validation !== "object") {
    errors.push("validation: required object");
  }
  if (!r.evidence || typeof r.evidence !== "object") {
    errors.push("evidence: required object");
  } else {
    const evidence = r.evidence as Record<string, unknown>;
    if (!VALID_EXECUTION_TYPES.includes(evidence.executionType as string)) {
      errors.push(`evidence.executionType: must be one of ${VALID_EXECUTION_TYPES.join(", ")}`);
    }
    if (typeof evidence.publicClaimEligible !== "boolean") {
      errors.push("evidence.publicClaimEligible: required boolean");
    }
  }
  if (!r.metadata || typeof r.metadata !== "object") {
    errors.push("metadata: required object");
  }

  return { valid: errors.length === 0, errors };
}

function validateScenario(scenario: unknown): ValidationResult {
  const s = scenario as Record<string, unknown>;
  const errors: string[] = [];

  if (!s.id || typeof s.id !== "string") {
    errors.push("id: required string");
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id as string)) {
    errors.push("id: must be kebab-case");
  }
  if (!s.name || typeof s.name !== "string") {
    errors.push("name: required string");
  }
  if (!s.prompt || typeof s.prompt !== "string" || (s.prompt as string).length < 20) {
    errors.push("prompt: required string, minLength 20");
  }
  if (!s.fixtureDir || typeof s.fixtureDir !== "string") {
    errors.push("fixtureDir: required string");
  }
  if (!s.validation || typeof s.validation !== "object") {
    errors.push("validation: required object");
  } else {
    const v = s.validation as Record<string, unknown>;
    if (!v.command || typeof v.command !== "string") {
      errors.push("validation.command: required string");
    }
    if (typeof v.expectedExitCode !== "number") {
      errors.push("validation.expectedExitCode: required number");
    }
  }

  return { valid: errors.length === 0, errors };
}

export { validateRunResult, validateScenario };
