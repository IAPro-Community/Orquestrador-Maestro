"use strict";

const { PlanArtifactRenderer } = require("./plan-artifact-renderer");
const { PlanArtifactStore } = require("./plan-artifact-store");
const { PlanRevisionCompiler } = require("./plan-revision-compiler");
const { ExternalEditorLauncher } = require("./external-editor-launcher");
const { PlanApprovalGate } = require("./plan-approval-gate");

class PlanRevisionService {
  constructor({ store, editor, compiler } = {}) {
    this.store = store || null;
    this.editor = editor || new ExternalEditorLauncher();
    this.compiler = compiler || new PlanRevisionCompiler();
  }

  async createPlan(missionId, proposal, context = {}) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");
    if (!proposal || typeof proposal !== "object") throw new TypeError("proposal is required");

    const content = PlanArtifactRenderer.render(proposal, context);
    const result = await this.store.writePlanArtifact(missionId, content);
    return { written: result.written, path: result.path, missionId };
  }

  async openForReview(missionId) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");

    const filePath = this.store.planArtifactPath(missionId);
    const result = await this.editor.launch(filePath);
    return { launched: result.success, reason: result.reason, editor: result.editor, filePath };
  }

  async compileRevision(missionId, originalProposal, context = {}) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");
    if (!originalProposal || typeof originalProposal !== "object") throw new TypeError("originalProposal is required");

    const read = await this.store.readPlanArtifact(missionId);
    if (!read.exists) {
      return Object.freeze({
        changed: false,
        valid: true,
        tasks: [],
        errors: Object.freeze(["Plan file not found"]),
        warnings: []
      });
    }

    const originalContent = PlanArtifactRenderer.render(originalProposal);
    const result = this.compiler.compile(originalContent, read.content, originalProposal, { allowTaskRemoval: context.allowTaskRemoval !== false });
    const missionBrief = context.missionBrief || null;
    const errors = [...result.errors];

    if (missionBrief && Array.isArray(missionBrief.constraints)) {
      for (const task of result.tasks) {
        const text = `${task.title || ""} ${task.objective || ""}`.toLowerCase();
        for (const constraint of missionBrief.constraints) {
          const c = String(constraint).toLowerCase();
          if ((c.includes("no graphql") || c.includes("rest only")) &&
              /\b(graphql|apollo|schema\.gql|mutation|query resolver)\b/i.test(text)) {
            errors.push(`Task "${task.title}" contradicts mission constraint: ${constraint}`);
          }
        }
      }
    }

    return Object.freeze({
      changed: result.changed,
      valid: errors.length === 0,
      tasks: result.tasks,
      errors: Object.freeze(errors),
      warnings: result.warnings
    });
  }

  async approveRevision(missionId, taskGraphId, userDecision = "approved", metadata = {}) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");
    if (!taskGraphId || typeof taskGraphId !== "string") throw new TypeError("taskGraphId is required");

    const approval = PlanApprovalGate.recordHumanApproval({ taskGraphId, userDecision }, metadata);

    if (this.store && typeof this.store.saveApproval === "function") {
      await this.store.saveApproval(approval);
    }

    if (this.store && typeof this.store.appendEvent === "function") {
      await this.store.appendEvent({
        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        runId: undefined,
        type: "plan.approved",
        occurredAt: new Date().toISOString(),
        data: { missionId, taskGraphId, approvalType: approval.approvalType, userDecision }
      });
    }

    return approval;
  }

  async autoApprove(missionId, taskGraphId, options = {}) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");
    if (!taskGraphId || typeof taskGraphId !== "string") throw new TypeError("taskGraphId is required");

    const evalResult = PlanApprovalGate.evaluateAutoApproval({
      validationResult: options.validationResult,
      planningMode: options.planningMode
    }, { autoFallbackAllowed: options.autoFallbackAllowed || false });

    if (evalResult.approved && this.store && typeof this.store.saveApproval === "function") {
      await this.store.saveApproval(evalResult);
    }

    if (evalResult.approved && this.store && typeof this.store.appendEvent === "function") {
      await this.store.appendEvent({
        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        runId: undefined,
        type: "plan.auto_approved",
        occurredAt: new Date().toISOString(),
        data: { missionId, taskGraphId, approvalType: evalResult.approvalType }
      });
    }

    return evalResult;
  }

  async cancel(missionId) {
    if (!missionId || typeof missionId !== "string") throw new TypeError("missionId is required");
    return Object.freeze({ cancelled: true, missionId, cancelledAt: new Date().toISOString() });
  }
}

module.exports = { PlanRevisionService };
