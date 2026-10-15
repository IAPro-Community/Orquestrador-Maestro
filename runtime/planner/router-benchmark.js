"use strict";

function selectedIds(result) {
  return (result?.allSkills || [
    result?.primarySkill,
    ...(result?.chainedSkills || [])
  ]).filter(Boolean).map((skill) => skill.id);
}

function accuracy(correct, labeled) {
  return labeled === 0 ? null : correct / labeled;
}

function benchmarkRouters(cases, { routerV2, routerV3 } = {}) {
  if (!routerV2 || typeof routerV2.resolve !== "function") throw new TypeError("routerV2.resolve is required");
  if (!routerV3 || typeof routerV3.resolve !== "function") throw new TypeError("routerV3.resolve is required");
  if (!Array.isArray(cases) || cases.length === 0) throw new TypeError("benchmark cases must be a non-empty array");

  let labeled = 0;
  let v2Correct = 0;
  let v3Correct = 0;
  let v2SkillTotal = 0;
  let v3SkillTotal = 0;
  let v3ContextTotal = 0;
  let v3ContextSamples = 0;
  let samePrimary = 0;

  const results = cases.map((caseDefinition) => {
    const intent = String(caseDefinition.intent || "");
    const expectedPrimary = caseDefinition.expect?.primary || null;
    const v2 = routerV2.resolve(intent);
    const v3 = routerV3.resolve(intent);
    const v2Primary = v2?.primarySkill?.id || null;
    const v3Primary = v3?.primarySkill?.id || null;
    const v2Selected = selectedIds(v2);
    const v3Selected = selectedIds(v3);

    if (expectedPrimary) {
      labeled += 1;
      if (v2Primary === expectedPrimary) v2Correct += 1;
      if (v3Primary === expectedPrimary) v3Correct += 1;
    }
    if (v2Primary === v3Primary) samePrimary += 1;
    v2SkillTotal += v2Selected.length;
    v3SkillTotal += v3Selected.length;
    if (Number.isFinite(v3?.estimatedContextTokens)) {
      v3ContextTotal += v3.estimatedContextTokens;
      v3ContextSamples += 1;
    }

    return Object.freeze({
      id: caseDefinition.id,
      intent,
      expectedPrimary,
      v2Primary,
      v3Primary,
      samePrimary: v2Primary === v3Primary,
      v2Selected: Object.freeze(v2Selected),
      v3Selected: Object.freeze(v3Selected),
      v3Complexity: v3?.complexity?.level || null,
      v3EstimatedContextTokens: v3?.estimatedContextTokens ?? null
    });
  });

  return Object.freeze({
    total: cases.length,
    labeled,
    v2: Object.freeze({
      correct: v2Correct,
      accuracy: accuracy(v2Correct, labeled),
      avgSelectedSkills: v2SkillTotal / cases.length
    }),
    v3: Object.freeze({
      correct: v3Correct,
      accuracy: accuracy(v3Correct, labeled),
      avgSelectedSkills: v3SkillTotal / cases.length,
      avgEstimatedContextTokens: v3ContextSamples > 0 ? v3ContextTotal / v3ContextSamples : null
    }),
    comparison: Object.freeze({
      samePrimary: samePrimary,
      samePrimaryRate: samePrimary / cases.length,
      v3Regressions: Object.freeze(results
        .filter((item) => item.expectedPrimary && item.v2Primary === item.expectedPrimary && item.v3Primary !== item.expectedPrimary)
        .map((item) => item.id)),
      v3Fixes: Object.freeze(results
        .filter((item) => item.expectedPrimary && item.v2Primary !== item.expectedPrimary && item.v3Primary === item.expectedPrimary)
        .map((item) => item.id))
    }),
    results: Object.freeze(results)
  });
}

module.exports = { benchmarkRouters, selectedIds };
