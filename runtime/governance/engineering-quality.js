"use strict";

const { CHANGE_CLASSES } = require("./change-governance");

const QUALITY_SEVERITIES = Object.freeze(["BLOCKER", "HIGH", "MEDIUM", "LOW"]);
const BAD_CODE_CATEGORIES = Object.freeze([
  "ARCHITECTURE", "RESPONSIBILITY", "COUPLING", "SEMANTICS", "STATE",
  "ERROR_HANDLING", "DATA_INTEGRITY", "TESTABILITY", "SECURITY",
  "PERFORMANCE", "MAINTAINABILITY"
]);

function normalize(value) {
  return String(value || "").trim();
}

function classifyQualityFinding(input = {}) {
  const severity = normalize(input.severity).toUpperCase() || "MEDIUM";
  const category = normalize(input.category).toUpperCase() || "MAINTAINABILITY";
  if (!QUALITY_SEVERITIES.includes(severity)) throw new TypeError(`Unknown quality finding severity: ${severity}`);
  if (!BAD_CODE_CATEGORIES.includes(category)) throw new TypeError(`Unknown quality finding category: ${category}`);
  return Object.freeze({
    code: normalize(input.code) || "unspecified-quality-finding",
    category,
    severity,
    message: normalize(input.message),
    blocking: severity === "BLOCKER" || severity === "HIGH"
  });
}

function buildEngineeringContract({ task = {}, missionBrief = {}, verificationStrategy = [] } = {}) {
  const capabilities = Array.isArray(task.requiredCapabilities) ? [...task.requiredCapabilities] : [];
  const constraints = Array.isArray(missionBrief.constraints) ? [...missionBrief.constraints] : [];
  const criteria = Array.isArray(task.acceptanceCriteria) ? [...task.acceptanceCriteria] : [];
  const strategy = verificationStrategy.length ? [...verificationStrategy] : ["targeted-checks", "acceptance-evidence"];
  const boundaries = Array.isArray(task.affectedBoundaries) ? [...task.affectedBoundaries] : [];
  const qualityExpectations = Array.isArray(task.qualityExpectations) ? [...task.qualityExpectations] : [
    "coherent-responsibilities", "domain-meaningful-names", "proportional-tests", "verified-acceptance"
  ];
  const mandatoryPreCode = Array.isArray(task.mandatoryPreCode)
    ? [...task.mandatoryPreCode]
    : [...(CHANGE_CLASSES[task.changeClass]?.mandatoryPreCode || [])];
  return Object.freeze({
    goal: normalize(task.objective),
    scope: Object.freeze({ classification: task.scopeClassification || "IN_SCOPE", justification: task.scopeJustification || "" }),
    constraints: Object.freeze(constraints),
    changeClass: task.changeClass || "local",
    mandatoryPreCode: Object.freeze(mandatoryPreCode),
    affectedDomain: task.type || "unspecified",
    affectedBoundaries: Object.freeze(boundaries),
    affectedCapabilities: Object.freeze(capabilities),
    architectureImpact: task.architectureImpact || (task.changeClass === "structural" ? "review-boundaries-and-dependencies" : "review-local-responsibility"),
    qualityExpectations: Object.freeze(qualityExpectations),
    acceptanceCriteria: Object.freeze(criteria),
    verificationStrategy: Object.freeze(strategy)
  });
}

function detectQualityFindings({ filePath = "", source = "" } = {}) {
  const findings = [];
  const lines = String(source).split(/\r?\n/);
  // Threshold based on typical module size; files exceeding this likely mix unrelated responsibilities.
  const LINE_LIMIT = 800;
  if (lines.length > LINE_LIMIT) {
    findings.push(classifyQualityFinding({ code: "excessive-file-responsibility", category: "RESPONSIBILITY", severity: "HIGH", message: `${filePath} has ${lines.length} lines (limit ${LINE_LIMIT}); review its responsibilities before completion.` }));
  }
  if (/\b(?:process\w+|do\w+|execute\w+|handle\w+|run\w+)\s*\(/u.test(source)) {
    findings.push(classifyQualityFinding({ code: "generic-operation-name", category: "SEMANTICS", severity: "LOW", message: `${filePath} contains a generic operation name whose domain intent should be checked.` }));
  }
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/u.test(source)) {
    findings.push(classifyQualityFinding({ code: "swallowed-error", category: "ERROR_HANDLING", severity: "HIGH", message: `${filePath} contains an empty catch block.` }));
  }
  if (/\.(?:ts|tsx)$/u.test(filePath) && /:\s*any\b/u.test(source)) {
    findings.push(classifyQualityFinding({ code: "unsafe-any", category: "MAINTAINABILITY", severity: "MEDIUM", message: `${filePath} uses ': any' where a domain type should be considered.` }));
  }
  return Object.freeze(findings);
}

module.exports = { QUALITY_SEVERITIES, BAD_CODE_CATEGORIES, classifyQualityFinding, buildEngineeringContract, detectQualityFindings };
