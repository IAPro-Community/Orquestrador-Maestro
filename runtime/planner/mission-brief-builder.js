"use strict";

function buildMissionBrief(intentSpec, taskRelevantContext) {
  // Converte a State Machine Spec no formato que a Application espera (compatível com approveMissionBrief)

  return {
    objective: intentSpec.objective || intentSpec.intent,
    requirements: [...intentSpec.requirements],
    constraints: [...intentSpec.constraints],
    userDecisions: [...intentSpec.userDecisions],
    relevantContext: JSON.stringify(taskRelevantContext)
  };
}

module.exports = {
  buildMissionBrief
};
