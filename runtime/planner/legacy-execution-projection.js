"use strict";

class LegacyExecutionProjection {
  static projectTask(semanticTask, options = {}) {
    if (!semanticTask || typeof semanticTask !== "object") {
      throw new TypeError("semanticTask must be an object");
    }

    const executionTarget = (options && typeof options === "object" && options.executionTarget) || options || {};
    const providerId = executionTarget.providerId || executionTarget.provider;
    const model = executionTarget.model;

    if (!providerId || typeof providerId !== "string" || providerId.trim() === "") {
      throw new TypeError("MISSING_EXECUTION_TARGET: providerId is required for legacy execution projection");
    }
    if (!model || typeof model !== "string" || model.trim() === "") {
      throw new TypeError("MISSING_EXECUTION_TARGET: model is required for legacy execution projection");
    }

    const criteriaFormatted = (Array.isArray(semanticTask.acceptanceCriteria) && semanticTask.acceptanceCriteria.length > 0)
      ? `\n\nAcceptance Criteria:\n${semanticTask.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`
      : "";

    return Object.freeze({
      id: semanticTask.id,
      label: semanticTask.title,
      description: `${semanticTask.objective}${criteriaFormatted}`,
      skills: [...(semanticTask.requiredSkills || [])],
      dependsOn: [...(semanticTask.dependsOn || [])],
      provider: providerId.trim(),
      model: model.trim(),
      semanticMetadata: semanticTask
    });
  }

  static projectGraph(semanticTasks, options = {}) {
    if (!Array.isArray(semanticTasks)) {
      throw new TypeError("semanticTasks must be an array");
    }
    return Object.freeze(semanticTasks.map((t) => LegacyExecutionProjection.projectTask(t, options)));
  }
}

module.exports = { LegacyExecutionProjection };
