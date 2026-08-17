"use strict";

class WorkflowEngine {
  constructor({ approvals = new Map() } = {}) {
    this.approvals = approvals;
  }

  approve(id, decision) {
    this.approvals.set(id, decision);
  }

  async execute(workflow, context = {}) {
    const artifacts = [];
    for (const step of workflow.steps || []) {
      if (step.condition && !step.condition(context, artifacts)) continue;
      if (step.approvalId && this.approvals.get(step.approvalId) !== "approved") {
        return { status: "awaiting_approval", artifacts, approvalId: step.approvalId };
      }
      let lastError;
      const attempts = (step.retry || 0) + 1;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          const artifact = await step.execute({ ...context, artifacts, attempt });
          if (artifact !== undefined) artifacts.push(artifact);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) return { status: "failed", artifacts, failedStepId: step.id, error: lastError };
    }
    return { status: "completed", artifacts };
  }
}

module.exports = { WorkflowEngine };
