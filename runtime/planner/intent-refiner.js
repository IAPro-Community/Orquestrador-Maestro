"use strict";

const { createIntentSpec, isValidTransition } = require("./intent-spec");
const { parseRefinementProposal } = require("./proposal-parser");
const { validateProposal, applyProposal } = require("./proposal-validator");
const { evaluateReadiness } = require("./readiness-evaluator");

class IntentRefiner {
  constructor({ aiProvider, application, taskRelevantContext }) {
    this.providerId = aiProvider;
    this.app = application;
    this.context = taskRelevantContext;
  }

  async refine(intentSpec, clarification = null) {
    if (!isValidTransition(intentSpec.status, "REFINING")) {
      // Just a safety check, we'll force it for now
    }

    const provider = this.app.providers.get(this.providerId);
    if (!provider) {
      return intentSpec; // fallback to unchanged if no provider
    }

    try {
      const isInstalled = await provider.detect();
      if (!isInstalled.installed) return intentSpec;
    } catch (e) {
      return intentSpec;
    }

    const specState = {
      objective: intentSpec.objective || intentSpec.intent,
      requirements: intentSpec.requirements || [],
      constraints: intentSpec.constraints || [],
      userDecisions: intentSpec.userDecisions || [],
      unknowns: (intentSpec.unknowns || []).map(u => ({
        id: u.id,
        dimension: u.dimension,
        description: u.description,
        status: u.status,
        blocking: u.blocking
      }))
    };

    const clarificationBlock = clarification
      ? `Latest human clarification (authoritative USER_DECISION — NOT an AI inference, NOT a project FACT):
question dimension: ${clarification.blocker ? clarification.blocker.dimension : "unknown"}
question: ${clarification.blocker ? clarification.blocker.description : ""}
human answer: ${clarification.answer}`
      : "No human clarification available for this round.";

    const systemPrompt = `You are a Senior Software Architect. Return ONLY a JSON object of type RefinementProposal.
Intent: ${intentSpec.objective || intentSpec.intent}
Current IntentSpec state:
${JSON.stringify(specState, null, 2)}
Context: ${JSON.stringify(this.context)}

${clarificationBlock}

Rules:
- The human clarification (when present) is an authoritative USER_DECISION. Extract EVERY concrete statement from it into addRequirements and addConstraints. Do not treat it as an AI inference and do not restate it as a project FACT.
- Do NOT invent new requirements or constraints from the project context alone; only derive structure from the intent, the human clarification, or evidence present in Context.
- Disambiguate USER DECISIONS (e.g. "use existing persistence") from FACTS (e.g. "project currently uses MongoDB"). A user decision must not be reported as a fact about the project.
- Only add detectedUnknowns with blocking: true for genuinely unresolved, evidence-based concerns. If a concern was already answered, do not re-open it; use a NEW id for genuinely new concerns.
If the intent is vague, propose detectedUnknowns with blocking: true.
Schema:
{
  "updates": { "objective": "string" },
  "addRequirements": ["string"],
  "addConstraints": ["string"],
  "detectedUnknowns": [{ "id": "string", "dimension": "string", "description": "string", "status": "OPEN", "blocking": true }],
  "question": null,
  "recommendation": null
}`;

    let lastError = null;
    let validProposal = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      let result;
      try {
        const handle = await provider.execute({
          prompt: systemPrompt,
          model: "default",
          workspacePath: process.cwd()
        });
        result = await handle.result;
      } catch (e) {
        throw e; // Provider failure is atomic, bubbles up immediately
      }

      let parsed;
      try {
        parsed = parseRefinementProposal(result.stdout || "");
        validProposal = validateProposal(parsed, intentSpec, this.context);
        break; // Success!
      } catch (e) {
        lastError = e;
        // Continue to retry on parser/validation failure
      }
    }

    if (!validProposal) {
      throw lastError; // Exhausted retries, ABORT
    }

    const newSpec = applyProposal(intentSpec, validProposal);

    return newSpec;
  }
}

module.exports = {
  IntentRefiner
};
