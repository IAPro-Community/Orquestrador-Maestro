"use strict";

// Canonical semantic contract for change risk, scope containment and completion.
// Consumers may add routing detail, but must derive gates from these values.
const CHANGE_CLASSES = Object.freeze({
  trivial: Object.freeze({ mandatoryPreCode: Object.freeze([]) }),
  local: Object.freeze({ mandatoryPreCode: Object.freeze([]) }),
  structural: Object.freeze({ mandatoryPreCode: Object.freeze(["deep-interview", "skill-preflight", "skill-adr"]) }),
  integration: Object.freeze({ mandatoryPreCode: Object.freeze(["deep-interview", "skill-preflight", "skill-adr"]) }),
  "security-compliance": Object.freeze({ mandatoryPreCode: Object.freeze(["deep-interview", "skill-preflight", "skill-adr"]) }),
  "domain-critical": Object.freeze({ mandatoryPreCode: Object.freeze(["deep-interview", "skill-preflight", "skill-adr"]) })
});
const HIGH_RISK_CHANGE_CLASSES = Object.freeze(["structural", "integration", "security-compliance", "domain-critical"]);
const SCOPE_CLASSIFICATIONS = Object.freeze(["IN_SCOPE", "REQUIRED_DEPENDENCY", "DISCOVERED_WORK", "OUT_OF_SCOPE"]);

const PATTERNS = Object.freeze([
  ["security-compliance", /\b(authentication|authorization|permission|permissions|secret|secrets|token|credential|pii|lgpd|security|tenant isolation|rls|payment|billing|webhook)\b/i],
  ["domain-critical", /\b(domain rule|business rule|invariant|financial|medical|compliance|entitlement)\b/i],
  ["integration", /\b(api|adapter|provider|integration|external service|deployment|infra|infrastructure)\b/i],
  ["structural", /\b(architecture|architectural|refactor|boundary|boundaries|coupling|cycle|layering|module split|schema migration|database migration|migration)\b/i]
]);

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function classifyChange({ text = "", paths = [], changeClass } = {}) {
  const explicit = normalizeText(changeClass);
  const combined = [text, ...paths].map(normalizeText).join(" ");
  const selected = Object.prototype.hasOwnProperty.call(CHANGE_CLASSES, explicit)
    ? explicit
    : PATTERNS.find(([, pattern]) => pattern.test(combined))?.[0] || (combined.length < 80 ? "trivial" : "local");
  return Object.freeze({ changeClass: selected, highRisk: HIGH_RISK_CHANGE_CLASSES.includes(selected), mandatoryPreCode: CHANGE_CLASSES[selected].mandatoryPreCode });
}

function classifyDiscovery({ necessary = false, requiredDependency = false, justification = "", discovered = false, outOfScope = false } = {}) {
  let classification = "DISCOVERED_WORK";
  if (outOfScope) classification = "OUT_OF_SCOPE";
  else if (requiredDependency) classification = "REQUIRED_DEPENDENCY";
  else if (necessary && !discovered) classification = "IN_SCOPE";
  const hasJustification = typeof justification === "string" && justification.trim().length > 0;
  const eligible = classification === "IN_SCOPE" || (classification === "REQUIRED_DEPENDENCY" && hasJustification);
  return Object.freeze({ classification, eligible, requiresJustification: classification === "REQUIRED_DEPENDENCY", hasJustification });
}

function isScopeExecutionEligible(item = {}) {
  const classification = item.scopeClassification;
  if (classification === "IN_SCOPE" || classification === undefined) return true;
  if (classification === "REQUIRED_DEPENDENCY") return typeof item.scopeJustification === "string" && item.scopeJustification.trim().length > 0;
  return false;
}

function isRiskExecutionEligible(changeClass, { profileId, riskOverride } = {}) {
  if (!HIGH_RISK_CHANGE_CLASSES.includes(changeClass) || profileId === "guided-engineering") return true;
  return riskOverride?.marker === "proceed with warning"
    && typeof riskOverride.note === "string"
    && riskOverride.note.trim().length > 0;
}

function criterionKey(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return String(value.id || value.condition || "").trim();
  return "";
}

function deriveOutcomeContract(task = {}) {
  return Object.freeze({
    intent: typeof task.objective === "string" ? task.objective : "",
    expectedOutcome: typeof task.expectedOutcome === "string" && task.expectedOutcome.trim()
      ? task.expectedOutcome.trim()
      : (typeof task.objective === "string" ? task.objective : ""),
    acceptanceConditions: Object.freeze(Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria.map(criterionKey).filter(Boolean) : []),
    evidenceRequirements: Object.freeze(Array.isArray(task.evidenceRequirements) ? task.evidenceRequirements.map(criterionKey).filter(Boolean) : [])
  });
}

function evidenceCoversCriterion(evidence, criterion) {
  if (!evidence || typeof evidence !== "object" || criterionKey(evidence.content) === "") return false;
  const expected = criterionKey(criterion);
  return criterionKey(evidence.acceptanceCriterion) === expected || evidence.criterionId === expected || evidence.acceptanceCriterionId === expected;
}

function isTaskCompletionEligible(task, { evidence = [], verification = {}, qualityFindings = [], executor, verifier, deterministic = true } = {}) {
  const outcome = deriveOutcomeContract(task);
  const criteria = outcome.acceptanceConditions;
  const evidenceRequirements = outcome.evidenceRequirements;
  const matchingEvidence = Array.isArray(evidence) ? evidence.filter((item) => item?.taskId === task?.id) : [];
  const missingCriteria = criteria.filter((criterion) => !matchingEvidence.some((item) => evidenceCoversCriterion(item, criterion)));
  const missingEvidenceRequirements = evidenceRequirements.filter((requirement) => !matchingEvidence.some((item) => evidenceCoversCriterion(item, requirement)));
  const independent = deterministic || !executor || !verifier || executor !== verifier;
  const verificationFailed = verification?.status === "failed" || verification?.requiredFailure;
  const blockingFindings = qualityFindings.filter((finding) => finding && (finding.blocking || ["BLOCKER", "HIGH"].includes(String(finding.severity).toUpperCase())));
  const eligible = missingCriteria.length === 0 && missingEvidenceRequirements.length === 0 && (!(criteria.length || evidenceRequirements.length) || verification?.status === "passed") && !verificationFailed && independent && blockingFindings.length === 0;
  return Object.freeze({ eligible, missingCriteria: Object.freeze(missingCriteria), missingEvidenceRequirements: Object.freeze(missingEvidenceRequirements), blockingFindings: Object.freeze(blockingFindings), reason: eligible ? "criteria-and-verification-satisfied" : "required-evidence-verification-or-quality-gate-missing" });
}

module.exports = { CHANGE_CLASSES, HIGH_RISK_CHANGE_CLASSES, SCOPE_CLASSIFICATIONS, classifyChange, classifyDiscovery, isScopeExecutionEligible, isRiskExecutionEligible, deriveOutcomeContract, isTaskCompletionEligible };
