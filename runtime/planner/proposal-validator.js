"use strict";

const { createIntentSpec } = require("./intent-spec");

function validateProposal(proposal, intentSpec, taskRelevantContext) {
  // Defensive copy
  const valid = { ...proposal };

  // If there's a question, verify if the context already answers it
  if (valid.question) {
    const dimension = valid.question.dimension;
    if (taskRelevantContext && Array.isArray(taskRelevantContext.items)) {
      // Very naive contradiction check: if context has a FACT related to this dimension
      // In a real scenario, this would map dimensions to context keys more robustly.
      const hasFact = taskRelevantContext.items.some(item =>
        item.type === "FACT" && item.key.toLowerCase().includes(dimension.toLowerCase())
      );

      if (hasFact) {
        // Redundant question, suppress it
        valid.question = null;
      }
    }
  }

  return valid;
}

function applyProposal(intentSpec, validProposal) {
  const mergedRequirements = new Set(intentSpec.requirements);
  if (Array.isArray(validProposal.addRequirements)) {
    validProposal.addRequirements.forEach(r => mergedRequirements.add(r));
  }

  const mergedConstraints = new Set(intentSpec.constraints);
  if (Array.isArray(validProposal.addConstraints)) {
    validProposal.addConstraints.forEach(c => mergedConstraints.add(c));
  }

  // Handle unknowns: merge by id, existing state wins (first-wins).
  // A RESOLVED/answered unknown must not be resurrected by a same-id OPEN
  // proposal; genuinely new concerns must arrive under a new id.
  const unknownsMap = new Map();
  intentSpec.unknowns.forEach(u => unknownsMap.set(u.id, u));
  if (Array.isArray(validProposal.detectedUnknowns)) {
    validProposal.detectedUnknowns.forEach(u => {
      if (u && typeof u.id === "string" && !unknownsMap.has(u.id)) {
        unknownsMap.set(u.id, u);
      }
    });
  }
  const mergedUnknowns = Array.from(unknownsMap.values());

  const newObjective = (validProposal.updates && validProposal.updates.objective) || intentSpec.objective;

  return createIntentSpec(intentSpec.intent, {
    ...intentSpec,
    objective: newObjective,
    requirements: Array.from(mergedRequirements),
    constraints: Array.from(mergedConstraints),
    unknowns: mergedUnknowns
  });
}

module.exports = {
  validateProposal,
  applyProposal
};
