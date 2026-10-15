"use strict";

/**
 * Compacta o contexto de uma tarefa para otimizar tokens e focar o modelo
 * no que é relevante para o task e sua complexidade.
 *
 * `fullContext.skills` is authoritative at execution time: those entries were
 * already selected by the runtime after routing/budget checks. Task metadata
 * remains a compatibility fallback for older callers.
 */
function compactContext(task, fullContext = {}) {
  const semantic = task?.metadata?.semanticTask || task?.metadata?.semantic || {};
  const complexity = task?.complexity || semantic.complexity || "medium";
  const selectedSkills = Array.isArray(fullContext.skills)
    ? fullContext.skills
    : Array.isArray(task?.skills) ? task.skills : [];
  const selectedFiles = Array.isArray(fullContext.files) ? fullContext.files : [];

  return {
    description: task?.description || semantic.objective || "",
    // Simple tasks may omit file context, but explicit/resolved skills are
    // execution instructions and must never disappear during compaction.
    files: complexity === "simple" ? [] : selectedFiles,
    skills: selectedSkills
  };
}

module.exports = { compactContext };
