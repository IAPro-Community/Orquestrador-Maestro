"use strict";

const { createIntentSpec, createIntentUnknown } = require("./intent-spec");

function resolveRecommendation(intentSpec, recommendation, userAccepted) {
  if (!userAccepted) {
    // If rejected, we do not modify the spec. The unknown stays open.
    return intentSpec;
  }

  // If accepted, find the target unknown and resolve it.
  const updatedUnknowns = intentSpec.unknowns.map(u => {
    if (u.id === recommendation.targetUnknown) {
      return createIntentUnknown({
        ...u,
        status: "RESOLVED"
      });
    }
    return u;
  });

  // Find dimension for formatting
  const targetU = intentSpec.unknowns.find(u => u.id === recommendation.targetUnknown);
  const dimension = targetU ? targetU.dimension : "unknown";

  const decisionStr = `Decided [${dimension}]: ${recommendation.recommendedValue}`;
  const updatedDecisions = [...intentSpec.userDecisions, decisionStr];

  return createIntentSpec(intentSpec.intent, {
    ...intentSpec,
    unknowns: updatedUnknowns,
    userDecisions: updatedDecisions
  });
}

module.exports = {
  resolveRecommendation
};
