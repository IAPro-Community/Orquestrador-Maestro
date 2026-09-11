"use strict";

const FAILED_DEPENDENCY_REASON = "FAILED_DEPENDENCY";
const { isTaskCompletionEligible } = require("../governance/change-governance");

function resolveOutcomes({ tasks = [], results } = {}) {
  if (!(results instanceof Map)) throw new TypeError("results must be a Map");
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const outcomes = new Map();

  for (const task of tasks) {
    const result = results.get(task.id);
    if (!result) throw new Error(`INCOMPLETE_EXECUTION_RESULTS: ${task.id}`);
    const blockedMatch = String(result.error || "").match(/blocked by failed dependency:\s*(.+)$/i);
    if (blockedMatch) {
      const blockedBy = blockedMatch[1].split(",").map((id) => id.trim()).filter((id) => byId.has(id));
      outcomes.set(task.id, { status: "blocked", reason: FAILED_DEPENDENCY_REASON, blockedBy });
    } else if (result.status === "failed") {
      outcomes.set(task.id, { status: "failed", blockedBy: [], error: result.error });
    } else if (result.status === "completed") {
      const completionResult = result.result && typeof result.result === "object"
        ? { ...result.result, ...result }
        : result;
      const eligibility = isTaskCompletionEligible(task, {
        evidence: completionResult.evidence,
        verification: completionResult.verification,
        qualityFindings: completionResult.qualityFindings,
        executor: completionResult.executor,
        verifier: completionResult.verifier,
        deterministic: completionResult.deterministic
      });
      if (!eligibility.eligible) {
        outcomes.set(task.id, { status: "failed", reason: "COMPLETION_EVIDENCE_REQUIRED", blockedBy: [], missingCriteria: eligibility.missingCriteria });
      } else {
        outcomes.set(task.id, { status: "completed", blockedBy: [] });
      }
    } else {
      throw new Error(`INCOMPLETE_EXECUTION_RESULTS: ${task.id}`);
    }
  }

  return outcomes;
}

module.exports = { FAILED_DEPENDENCY_REASON, resolveOutcomes };
