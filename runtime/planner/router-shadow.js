"use strict";

function normalizeVersion(value) {
  const version = String(value || "3");
  if (!["2", "3"].includes(version)) {
    throw new TypeError("router version must be 2 or 3");
  }
  return version;
}

function evaluateRouterShadow({ intent, routerV2, routerV3, activeVersion = "3", options = {} }) {
  if (!routerV2 || typeof routerV2.resolve !== "function") {
    throw new TypeError("routerV2.resolve is required");
  }
  if (!routerV3 || typeof routerV3.resolve !== "function") {
    throw new TypeError("routerV3.resolve is required");
  }

  const version = normalizeVersion(activeVersion);
  const resolvedV2 = routerV2.resolve(intent, options);
  let resolvedV3 = null;
  let v3ShadowError = null;

  try {
    resolvedV3 = routerV3.resolve(intent, options);
  } catch (error) {
    if (version === "3") throw error;
    v3ShadowError = typeof error?.code === "string" ? error.code : "ROUTER_V3_SHADOW_FAILED";
  }

  const resolved = version === "3" ? resolvedV3 : resolvedV2;
  const shadow = Object.freeze({
    activeVersion: Number(version),
    v2Primary: resolvedV2?.primarySkill?.id || null,
    v3Primary: resolvedV3?.primarySkill?.id || null,
    samePrimary: resolvedV3
      ? (resolvedV2?.primarySkill?.id || null) === (resolvedV3?.primarySkill?.id || null)
      : null,
    v3Complexity: resolvedV3?.complexity?.level || null,
    v3EstimatedContextTokens: resolvedV3?.estimatedContextTokens ?? null,
    v3SkillCount: resolvedV3?.allSkills?.length ?? null,
    v3ShadowError
  });

  return Object.freeze({ resolved, resolvedV2, resolvedV3, shadow });
}

module.exports = { evaluateRouterShadow, normalizeVersion };
