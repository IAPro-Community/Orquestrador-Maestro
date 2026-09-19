"use strict";

/**
 * Execution policy consistency (deterministic, no LLM).
 *
 * Reuses existing authorities instead of creating parallel governance:
 * - Cognitive Budget tiers (LEAN/STANDARD/ASSURANCE) stay the budget source.
 * - SKILL_EXECUTION_PROFILES stays the skill/subagent profile source.
 * - Autopilot quick/standard/deep, multiagent Fast/Standard/Deep/Team and
 *   Ralph loops are validated against those two, never the reverse.
 *
 * Statuses:
 * - ok: workflow fits the budget.
 * - narrowed: workflow asks less than the budget allows (legitimate).
 * - override-required: workflow asks more; needs explicit user override.
 * - conflict: workflow demands something the runtime cannot provide
 *   (e.g. 3 reviewers when maxReviewers=1).
 * - unsupported: unknown workflow/mode/provider capability.
 */

const { COGNITIVE_BUDGETS } = require("./change-governance");

const SKILL_PROFILES = (() => {
  try {
    // eslint-disable-next-line global-require
    return require("../../orquestrador/SKILL_EXECUTION_PROFILES.json").profiles || {};
  } catch {
    return {};
  }
})();

// Documented current policy matrix (code + skill docs as of this change).
// Numbers are upper bounds enforced elsewhere; this table only makes
// contradictions detectable without LLM interpretation.
const POLICY_MATRIX = Object.freeze({
  runtime: Object.freeze({
    LEAN: Object.freeze({ maxSkills: 1, maxReviewers: 0, maxIntelligentRetries: 0, reviewRequirement: "none" }),
    STANDARD: Object.freeze({ maxSkills: 3, maxReviewers: 0, maxIntelligentRetries: 1, reviewRequirement: "none" }),
    ASSURANCE: Object.freeze({ maxSkills: 3, maxReviewers: 1, maxIntelligentRetries: 2, reviewRequirement: "independent" })
  }),
  skillProfiles: Object.freeze({
    fast: Object.freeze({ maxSkills: 1, allowSubagents: false }),
    standard: Object.freeze({ maxSkills: 3, allowSubagents: false }),
    deep: Object.freeze({ maxSkills: 5, allowSubagents: true }),
    multiagent: Object.freeze({ maxSkills: 5, allowSubagents: true })
  }),
  autopilot: Object.freeze({
    quick: Object.freeze({ lanes: 1, planning: "minimal", architect: false, critic: false, review: "risk-only", verification: "focused" }),
    standard: Object.freeze({ lanes: "bounded", planning: "sufficient", architect: false, critic: false, review: "risk-based", verification: "task-appropriate" }),
    deep: Object.freeze({ lanes: "multiple", planning: "explicit", architect: true, critic: true, review: "specialized", verification: "broad" })
  }),
  multiagent: Object.freeze({
    Fast: Object.freeze({ agents: 0 }),
    Standard: Object.freeze({ agents: "0-1" }),
    Deep: Object.freeze({ agents: "2-4" }),
    Team: Object.freeze({ agents: "3-6" })
  }),
  ralph: Object.freeze({
    completion: "loop-until-DoD",
    architect: "tiered-always-unless-trivial",
    deslop: "conditional-on-signal-or-explicit-request",
    reverify: "after-deslop"
  })
});

function asTier(budget) {
  const id = String(budget?.id || budget?.tier || "STANDARD").toUpperCase();
  if (id === "LEAN") return "LEAN";
  if (id === "ASSURANCE") return "ASSURANCE";
  return "STANDARD";
}

function validateExecutionPolicy({ budget, workflow = {}, explicitOverride = null } = {}) {
  const tier = asTier(budget);
  const runtime = POLICY_MATRIX.runtime[tier];
  const reasons = [];
  if (!workflow || typeof workflow !== "object") {
    return Object.freeze({ status: "ok", tier, reasons: Object.freeze(["no-workflow-constraints"]) });
  }
  const requestedReviewers = Number.isInteger(workflow.reviewers) ? workflow.reviewers : 0;
  if (requestedReviewers > runtime.maxReviewers) {
    reasons.push(`conflict: workflow demands ${requestedReviewers} reviewer(s) but ${tier} allows maxReviewers=${runtime.maxReviewers}`);
    return Object.freeze({ status: "conflict", tier, reasons: Object.freeze(reasons) });
  }
  const requestedSkills = Number.isInteger(workflow.skills) ? workflow.skills : 0;
  if (requestedSkills > runtime.maxSkills) {
    if (explicitOverride && typeof explicitOverride.note === "string" && explicitOverride.note.trim() !== "") {
      reasons.push(`override: ${requestedSkills} skills exceed maxSkills=${runtime.maxSkills} with explicit note`);
      return Object.freeze({ status: "override-required", tier, reasons: Object.freeze(reasons), override: explicitOverride });
    }
    reasons.push(`conflict: workflow demands ${requestedSkills} skills but ${tier} allows maxSkills=${runtime.maxSkills}`);
    return Object.freeze({ status: "conflict", tier, reasons: Object.freeze(reasons) });
  }
  const wantsSubagents = workflow.allowSubagents === true;
  const profileName = typeof workflow.skillProfile === "string" ? workflow.skillProfile : null;
  const profile = profileName && SKILL_PROFILES[profileName];
  if (wantsSubagents && profile && profile.allowSubagents === false) {
    if (explicitOverride && typeof explicitOverride.note === "string" && explicitOverride.note.trim() !== "") {
      reasons.push(`override: subagents requested under ${profileName} (default deny) with explicit note`);
      return Object.freeze({ status: "override-required", tier, reasons: Object.freeze(reasons), override: explicitOverride });
    }
    reasons.push(`conflict: subagents requested but skill profile ${profileName} denies them`);
    return Object.freeze({ status: "conflict", tier, reasons: Object.freeze(reasons) });
  }
  if (!profileName || !profile) {
    if (profileName) {
      reasons.push(`unsupported: unknown skill profile ${profileName}`);
      return Object.freeze({ status: "unsupported", tier, reasons: Object.freeze(reasons) });
    }
  }
  // Narrowing is legitimate: asking less than the budget is always ok.
  if (requestedReviewers < runtime.maxReviewers || requestedSkills < runtime.maxSkills) {
    reasons.push("narrowed: workflow uses less than the budget allows");
    return Object.freeze({ status: "narrowed", tier, reasons: Object.freeze(reasons) });
  }
  reasons.push("ok: workflow fits the budget");
  return Object.freeze({ status: "ok", tier, reasons: Object.freeze(reasons) });
}

function minimumSufficientWorkflow({ risk, complexity, workstreams = 1, highRiskChange = false } = {}) {
  const r = String(risk || "low").toLowerCase();
  const c = String(complexity || "medium").toLowerCase();
  const streams = Number.isInteger(workstreams) && workstreams > 0 ? workstreams : 1;
  // Minimum Sufficient Workflow: do not run a 10-step pipeline when
  // executor -> test -> verify already proves the task.
  if ((r === "low" || r === "medium") && (c === "simple" || c === "medium") && streams === 1 && !highRiskChange) {
    return Object.freeze({ steps: Object.freeze(["executor", "test", "verify"]), rationale: "single-workstream low/medium risk: executor-test-verify suffices", fullPipeline: false });
  }
  return Object.freeze({ steps: Object.freeze(["plan", "execute", "verify", "review-if-required", "handoff"]), rationale: "breadth/risk justifies fuller pipeline", fullPipeline: true });
}

function resolveEffectivePolicy({ risk, complexity, workflow = "standard", explicitMode = null, providerCapabilities = {}, workstreams = 1, requiredSkills = 0, highRiskChange = false, budget } = {}) {
  const r = String(risk || "low").toLowerCase();
  const c = String(complexity || "medium").toLowerCase();
  const mode = explicitMode || workflow || "standard";
  const tier = asTier(budget || (r === "high" || r === "critical" || highRiskChange ? { id: "ASSURANCE" } : (r === "low" && c === "simple" ? { id: "LEAN" } : { id: "STANDARD" })));
  const runtime = POLICY_MATRIX.runtime[tier];
  const minWorkflow = minimumSufficientWorkflow({ risk: r, complexity: c, workstreams, highRiskChange });
  // Risk and complexity stay separate inputs; tier derives from risk first.
  const autopilot = POLICY_MATRIX.autopilot[mode] || POLICY_MATRIX.autopilot.standard;
  const agents = mode === "quick" ? { allowed: 0, desired: 0 }
    : mode === "deep" ? { allowed: 4, desired: Math.min(4, Math.max(0, workstreams)) }
      : { allowed: 1, desired: workstreams > 1 ? 1 : 0 };
  const skills = Math.min(requiredSkills > 0 ? requiredSkills : runtime.maxSkills, runtime.maxSkills);
  const reviewRequirement = tier === "ASSURANCE" ? "independent" : "none";
  const reviewCalls = tier === "ASSURANCE" && autopilot.review !== "risk-only" ? 1 : (tier === "ASSURANCE" ? 1 : 0);
  const retryBudget = runtime.maxIntelligentRetries;
  const verification = mode === "quick" ? "focused" : mode === "deep" ? "broad" : "task-appropriate";
  const validation = validateExecutionPolicy({ budget: { id: tier }, workflow: { reviewers: reviewCalls, skills: requiredSkills || 0 } });
  return Object.freeze({
    mode,
    tier,
    risk: r,
    complexity: c,
    skills: Object.freeze({ max: runtime.maxSkills, requested: requiredSkills || 0, effective: skills }),
    agents: Object.freeze({ allowed: agents.allowed, desired: providerCapabilities.allowSubagents === false ? 0 : agents.desired }),
    parallelism: agents.desired > 1 ? agents.desired : 1,
    review: Object.freeze({ requirement: reviewRequirement, calls: reviewCalls }),
    retryBudget,
    contextBudget: runtime,
    verification,
    workflow: minWorkflow,
    validation
  });
}

module.exports = { POLICY_MATRIX, validateExecutionPolicy, resolveEffectivePolicy, minimumSufficientWorkflow };
