"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PlanApprovalGate } = require("../runtime/planner/plan-approval-gate");

test("evaluateAutoApproval approves when valid, zero blockers, and planningMode is local-ai", () => {
  const res = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "local-ai"
  });
  assert.equal(res.approved, true);
  assert.equal(res.approvalType, "USER_AUTO_POLICY");
  assert.ok(res.approvedAt);
});

test("evaluateAutoApproval rejects deterministic-fallback unless autoFallbackAllowed is true", () => {
  const resDefault = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "deterministic-fallback"
  });
  assert.equal(resDefault.approved, false);
  assert.equal(resDefault.approvalType, "REJECTED");
  assert.match(resDefault.reason, /UNAUTHORIZED_FALLBACK_IN_AUTO_MODE/);

  const resExplicitFalse = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "deterministic-fallback"
  }, { autoFallbackAllowed: false });
  assert.equal(resExplicitFalse.approved, false);
  assert.equal(resExplicitFalse.approvalType, "REJECTED");
  assert.match(resExplicitFalse.reason, /UNAUTHORIZED_FALLBACK_IN_AUTO_MODE/);

  const resAllowed = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "deterministic-fallback"
  }, { autoFallbackAllowed: true });
  assert.equal(resAllowed.approved, true);
  assert.equal(resAllowed.approvalType, "USER_AUTO_POLICY");
});

test("evaluateAutoApproval rejects when validationResult has blockers or valid is false", () => {
  const resInvalid = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: false, blockers: [] },
    planningMode: "local-ai"
  });
  assert.equal(resInvalid.approved, false);
  assert.equal(resInvalid.approvalType, "REJECTED");
  assert.ok(resInvalid.reason);

  const resBlockers = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: ["Dependency cycle detected"] },
    planningMode: "local-ai"
  });
  assert.equal(resBlockers.approved, false);
  assert.equal(resBlockers.approvalType, "REJECTED");
  assert.ok(resBlockers.reason);

  const resNull = PlanApprovalGate.evaluateAutoApproval({
    validationResult: null,
    planningMode: "local-ai"
  });
  assert.equal(resNull.approved, false);
  assert.equal(resNull.approvalType, "REJECTED");
  assert.ok(resNull.reason);
});

test("recordHumanApproval creates approval record with approvalType: HUMAN_REVIEW, taskGraphId, userDecision, approvedAt", () => {
  const record = PlanApprovalGate.recordHumanApproval({
    taskGraphId: "tg-100",
    userDecision: "approved"
  }, { reviewer: "developer", reason: "manual check ok" });

  assert.equal(record.taskGraphId, "tg-100");
  assert.equal(record.approvalType, "HUMAN_REVIEW");
  assert.equal(record.userDecision, "approved");
  assert.ok(record.approvedAt);
  assert.deepEqual(record.metadata, { reviewer: "developer", reason: "manual check ok" });
  assert.ok(Object.isFrozen(record));
});

test("evaluateAutoApproval never marks approvalType as HUMAN_REVIEW", () => {
  const approvedRes = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: true, blockers: [] },
    planningMode: "local-ai"
  });
  assert.notEqual(approvedRes.approvalType, "HUMAN_REVIEW");
  assert.equal(approvedRes.approvalType, "USER_AUTO_POLICY");

  const rejectedRes = PlanApprovalGate.evaluateAutoApproval({
    validationResult: { valid: false, blockers: ["error"] },
    planningMode: "local-ai"
  });
  assert.notEqual(rejectedRes.approvalType, "HUMAN_REVIEW");
  assert.equal(rejectedRes.approvalType, "REJECTED");
});
