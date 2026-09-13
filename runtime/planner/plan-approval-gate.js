"use strict";

class PlanApprovalGate {
  static evaluateAutoApproval({ validationResult, planningMode } = {}, options = {}) {
    if (!validationResult || !validationResult.valid || (validationResult.blockers && validationResult.blockers.length > 0)) {
      return Object.freeze({
        approved: false,
        approvalType: "REJECTED",
        reason: "Validation blockers present in plan"
      });
    }

    if (planningMode === "deterministic-fallback" && !options.autoFallbackAllowed) {
      return Object.freeze({
        approved: false,
        approvalType: "REJECTED",
        reason: "UNAUTHORIZED_FALLBACK_IN_AUTO_MODE: Deterministic fallback requires interactive human review"
      });
    }

    return Object.freeze({
      approved: true,
      approvalType: "USER_AUTO_POLICY",
      approvedAt: new Date().toISOString()
    });
  }

  static recordHumanApproval({ taskGraphId, userDecision = "approved" } = {}, metadata = {}) {
    return Object.freeze({
      taskGraphId,
      approvalType: "HUMAN_REVIEW",
      userDecision,
      approvedAt: new Date().toISOString(),
      metadata: Object.freeze(metadata && typeof metadata === "object" ? { ...metadata } : {})
    });
  }
}

module.exports = { PlanApprovalGate };
