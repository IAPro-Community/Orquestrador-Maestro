"use strict";

function evaluateReadiness(intentSpec) {
  const blockers = [];

  // Check for unresolved blocking unknowns
  if (Array.isArray(intentSpec.unknowns)) {
    intentSpec.unknowns.forEach(u => {
      if (u.blocking && u.status === "OPEN") {
        blockers.push({
          type: "UNKNOWN_OPEN",
          dimension: u.dimension,
          description: u.description
        });
      }
    });
  }

  // Check for mandatory dimensions (e.g. objective, but we can also ensure constraints/requirements are somewhat populated or rely on LLM blockers)
  if (!intentSpec.objective || intentSpec.objective.trim() === "") {
    blockers.push({
      type: "MISSING_DIMENSION",
      dimension: "objective",
      description: "Objective is empty."
    });
  }

  // To properly support the "Hybrid State Machine + AI Advisor" strictness for --auto,
  // we must ensure sufficient dimensions are populated.
  // Objective alone is not enough if requirements and constraints are both empty.
  const hasRequirements = Array.isArray(intentSpec.requirements) && intentSpec.requirements.length > 0;
  const hasConstraints = Array.isArray(intentSpec.constraints) && intentSpec.constraints.length > 0;

  if (!hasRequirements && !hasConstraints) {
    blockers.push({
      type: "INCOMPLETE_DIMENSIONS",
      dimension: "coverage",
      description: "Insufficient requirements or constraints defined."
    });
  }

  return {
    ready: blockers.length === 0,
    blockers
  };
}

module.exports = {
  evaluateReadiness
};
