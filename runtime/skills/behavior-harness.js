"use strict";

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))];
}

function normalizeResolution(value = {}) {
  const selected = uniqueStrings(
    value.selectedSkills
    || value.selected
    || value.skills
    || (value.primarySkill ? [value.primarySkill] : [])
  );
  const primary = typeof value.primarySkill === "string" && value.primarySkill.trim()
    ? value.primarySkill.trim()
    : (typeof value.primary === "string" && value.primary.trim() ? value.primary.trim() : selected[0] || null);

  return Object.freeze({
    primary,
    selected: Object.freeze(selected),
    complexity: typeof value.complexity === "string" ? value.complexity : null,
    estimatedContextTokens: Number.isFinite(value.estimatedContextTokens)
      ? Number(value.estimatedContextTokens)
      : null
  });
}

function evaluateBehaviorCase(caseDefinition, resolution) {
  if (!caseDefinition || typeof caseDefinition !== "object") {
    throw new TypeError("behavior case must be an object");
  }
  if (typeof caseDefinition.id !== "string" || !caseDefinition.id.trim()) {
    throw new TypeError("behavior case id is required");
  }
  if (typeof caseDefinition.intent !== "string" || !caseDefinition.intent.trim()) {
    throw new TypeError("behavior case intent is required");
  }

  const expected = caseDefinition.expect && typeof caseDefinition.expect === "object"
    ? caseDefinition.expect
    : {};
  if (Object.keys(expected).length === 0) {
    throw new TypeError("behavior case expect must declare at least one assertion");
  }
  const actual = normalizeResolution(resolution);
  const failures = [];

  if (expected.primary && actual.primary !== expected.primary) {
    failures.push({
      code: "PRIMARY_SKILL_MISMATCH",
      expected: expected.primary,
      actual: actual.primary
    });
  }

  for (const skill of uniqueStrings(expected.selected)) {
    if (!actual.selected.includes(skill)) {
      failures.push({
        code: "EXPECTED_SKILL_MISSING",
        skill
      });
    }
  }

  for (const skill of uniqueStrings(expected.forbidden)) {
    if (actual.selected.includes(skill)) {
      failures.push({
        code: "FORBIDDEN_SKILL_SELECTED",
        skill
      });
    }
  }

  if (Number.isInteger(expected.maxSkills) && actual.selected.length > expected.maxSkills) {
    failures.push({
      code: "SKILL_BUDGET_EXCEEDED",
      maxSkills: expected.maxSkills,
      actual: actual.selected.length
    });
  }

  if (expected.complexity && actual.complexity !== expected.complexity) {
    failures.push({
      code: "COMPLEXITY_MISMATCH",
      expected: expected.complexity,
      actual: actual.complexity
    });
  }

  if (actual.primary && !actual.selected.includes(actual.primary)) {
    failures.push({
      code: "PRIMARY_NOT_SELECTED",
      primary: actual.primary
    });
  }

  if (Number.isInteger(expected.maxContextTokens)) {
    if (actual.estimatedContextTokens === null) {
      failures.push({
        code: "MISSING_CONTEXT_ESTIMATE",
        maxContextTokens: expected.maxContextTokens
      });
    } else if (actual.estimatedContextTokens > expected.maxContextTokens) {
      failures.push({
        code: "CONTEXT_BUDGET_EXCEEDED",
        maxContextTokens: expected.maxContextTokens,
        actual: actual.estimatedContextTokens
      });
    }
  }

  return Object.freeze({
    id: caseDefinition.id,
    intent: caseDefinition.intent,
    passed: failures.length === 0,
    failures: Object.freeze(failures.map((failure) => Object.freeze(failure))),
    actual
  });
}

async function runBehaviorCases(cases, resolver) {
  if (!Array.isArray(cases)) throw new TypeError("behavior cases must be an array");
  if (typeof resolver !== "function") throw new TypeError("behavior resolver must be a function");

  if (cases.length === 0) throw new TypeError("behavior cases must not be empty");
  const caseIds = new Set();
  const results = [];
  for (const caseDefinition of cases) {
    if (caseIds.has(caseDefinition?.id)) {
      throw new TypeError(`duplicate behavior case id: ${caseDefinition.id}`);
    }
    caseIds.add(caseDefinition?.id);
    const resolution = await resolver({
      intent: caseDefinition.intent,
      context: caseDefinition.context || {}
    });
    results.push(evaluateBehaviorCase(caseDefinition, resolution));
  }

  const failed = results.filter((result) => !result.passed);
  return Object.freeze({
    passed: failed.length === 0,
    total: results.length,
    passedCount: results.length - failed.length,
    failedCount: failed.length,
    results: Object.freeze(results)
  });
}

module.exports = {
  evaluateBehaviorCase,
  normalizeResolution,
  runBehaviorCases
};
