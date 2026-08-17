"use strict";

const { extractAssistantText } = require("../providers/provider-output");

class IntentReconciler {
  constructor({ provider } = {}) {
    this._provider = provider || null;
    this._aiCalls = 0;
  }

  get aiCalls() {
    return this._aiCalls;
  }

  async reconcile(intentSpec, confirmedAnswers, context, discoveryCandidates = {}) {
    if (!this._provider || !this._provider.detect || !this._provider.detect()) {
      return Object.freeze({ success: false, error: "Provider not available", proposal: null });
    }

    const prompt = this._buildReconciliationPrompt(intentSpec, confirmedAnswers, context, discoveryCandidates);

    try {
      this._aiCalls++;
      const handle = await this._provider.execute({
        prompt,
        model: "default",
        workspacePath: process.cwd()
      });
      const result = await handle.result;
      const proposal = this._parseResponse(result.stdout);
      return Object.freeze({ success: true, error: null, proposal });
    } catch (err) {
      return Object.freeze({ success: false, error: err.message, proposal: null });
    }
  }

  _buildReconciliationPrompt(intentSpec, confirmedAnswers, context, discoveryCandidates = {}) {
    const candidateReqs = Array.isArray(discoveryCandidates.candidateRequirements) ? discoveryCandidates.candidateRequirements : [];
    const candidateCons = Array.isArray(discoveryCandidates.candidateConstraints) ? discoveryCandidates.candidateConstraints : [];

    const specState = JSON.stringify({
      objective: intentSpec.objective,
      requirements: intentSpec.requirements || [],
      constraints: intentSpec.constraints || [],
      userDecisions: intentSpec.userDecisions || [],
      unknowns: (intentSpec.unknowns || []).map((u) => ({
        id: u.id, dimension: u.dimension, status: u.status, blocking: u.blocking
      }))
    }, null, 2);

    return `You are an intent reconciliation engine.

CURRENT INTENT SPEC:
${specState}

CONFIRMED HUMAN ANSWERS:
${JSON.stringify(confirmedAnswers, null, 2)}

CANDIDATE REQUIREMENTS (from AI discovery, NOT yet confirmed):
${candidateReqs.length > 0 ? JSON.stringify(candidateReqs, null, 2) : "none"}

CANDIDATE CONSTRAINTS (from AI discovery, NOT yet confirmed):
${candidateCons.length > 0 ? JSON.stringify(candidateCons, null, 2) : "none"}

TASK: Reconcile all confirmed human answers into a refined IntentSpec.

RULES:
- Human answers are AUTHORITATIVE USER_DECISIONs.
- They must NOT become AI INFERENCEs.
- Add requirements and constraints derived DIRECTLY from human answers.
- Candidate requirements/constraints from AI discovery should only be included if they are genuinely necessary and not contradicted by human answers.
- Do NOT re-ask questions already answered by the human.
- Only discover NEW unknowns if genuinely necessary.

OUTPUT FORMAT (JSON only):
{
  "objective": "refined objective",
  "addRequirements": ["req1"],
  "addConstraints": ["con1"],
  "detectedUnknowns": [],
  "question": null
}`;
  }

  _parseResponse(stdout) {
    if (!stdout || typeof stdout !== "string") {
      return { objective: null, addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null };
    }

    let text = extractAssistantText(stdout) || stdout;
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1];

    try {
      const parsed = JSON.parse(text.trim());
      // Backward-compatible with the legacy refiner schema: objective may be
      // wrapped under `updates.objective` (parseRefinementProposal contract).
      const objective = parsed.objective || (parsed.updates && parsed.updates.objective) || null;
      return {
        objective,
        addRequirements: Array.isArray(parsed.addRequirements) ? parsed.addRequirements : [],
        addConstraints: Array.isArray(parsed.addConstraints) ? parsed.addConstraints : [],
        detectedUnknowns: Array.isArray(parsed.detectedUnknowns) ? parsed.detectedUnknowns : [],
        question: parsed.question || null
      };
    } catch {
      return { objective: null, addRequirements: [], addConstraints: [], detectedUnknowns: [], question: null };
    }
  }
}

module.exports = { IntentReconciler };
