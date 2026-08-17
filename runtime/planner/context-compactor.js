"use strict";

/**
 * Compacta o contexto de uma tarefa para otimizar tokens e focar o modelo
 * no que é relevante para o `taskType` e a `complexity`.
 */
function compactContext(task, fullContext) {
  // Simple tasks don't need full context
  if (task.complexity === "simple") {
    return {
      description: task.description,
      files: [],
      skills: []
    };
  }

  // Se tem skills, inclui só as relevantes para a task
  const relevantSkills = task.skills || [];

  return {
    description: task.description,
    files: fullContext.files || [],
    skills: relevantSkills
  };
}

module.exports = { compactContext };
