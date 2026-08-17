"use strict";

const { createBatchQuestion } = require("./batch-question.js");
const { validateQuestionSet } = require("./question-set-validator.js");
const { extractAssistantText } = require("./../providers/provider-output.js");

const MAX_RETRIES = 3;

class BatchIntentDiscoverer {
  constructor({ provider } = {}) {
    this._provider = provider || null;
    this._discoveryRound = 0;
  }

  get discoveryRound() {
    return this._discoveryRound;
  }

  async discover(intent, intentSpec, skills, context) {
    if (!this._provider || !this._provider.detect || !this._provider.detect()) {
      return Object.freeze({
        questions: [],
        valid: true,
        validationErrors: [],
        questionCount: 0,
        discoveryRound: this._discoveryRound,
        structuredRetries: 0,
        error: null
      });
    }

    this._discoveryRound++;

    const prompt = this._buildDiscoveryPrompt(intent, intentSpec, skills, context);

    let lastError = null;
    let structuredRetries = 0;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const handle = await this._provider.execute({
          prompt,
          model: "default",
          workspacePath: process.cwd()
        });
        const result = await handle.result;
        const parsed = this._parseDiscoveryResponse(result.stdout);
        const questions = this._buildQuestions(parsed);
        const validation = validateQuestionSet(questions);

        if (attempt < MAX_RETRIES - 1 && (questions.length === 0 || !validation.valid)) {
          if (!validation.valid) structuredRetries++;
          continue;
        }

        return Object.freeze({
          questions: validation.valid ? questions : [],
          valid: validation.valid,
          validationErrors: validation.blockers.map((b) => b.message),
          questionCount: questions.length,
          discoveryRound: this._discoveryRound,
          structuredRetries,
          error: null
        });
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES - 1) continue;
      }
    }

    return Object.freeze({
      questions: [],
      valid: false,
      validationErrors: [lastError ? lastError.message : "Discovery failed after retries"],
      questionCount: 0,
      discoveryRound: this._discoveryRound,
      structuredRetries,
      error: lastError
    });
  }

  _buildDiscoveryPrompt(intent, intentSpec, skills, context) {
    const specState = intentSpec ? JSON.stringify({
      objective: intentSpec.objective,
      requirements: intentSpec.requirements || [],
      constraints: intentSpec.constraints || [],
      userDecisions: intentSpec.userDecisions || [],
      unknowns: (intentSpec.unknowns || []).map((u) => ({ id: u.id, dimension: u.dimension, status: u.status }))
    }, null, 2) : "{}";

    const skillsList = Array.isArray(skills) ? skills.map((s) => s.name || s.id || String(s)).join(", ") : "";

    return `You are a batch intent discovery engine.

USER INTENT:
${intent}

CURRENT SPEC STATE:
${specState}

APPLICABLE SKILLS:
${skillsList}

TASK: Discover as many relevant clarification dimensions as possible in ONE structured response.

RULES:
- Do not ask questions whose answer is already established by USER_DECISION.
- When a strong project FACT suggests a likely answer, expose it as a recommended option.
- Include questions that may only become relevant depending on answers to earlier questions.
- Represent those dependencies declaratively using activation conditions.
- Classify each question's decisionRequired as: HUMAN_REQUIRED, CONTEXT_CONFIRMABLE, or OPTIONAL.
- Do not ask implementation-detail questions that can be delegated to the engineering planner.
- M2 clarifies USER INTENT. M3 decides ENGINEERING DECOMPOSITION.

OUTPUT FORMAT (JSON only, no markdown):
{
  "questions": [
    {
      "id": "q1",
      "unknownId": "u1",
      "dimension": "scope",
      "group": "scope",
      "text": "Qual o escopo do projeto?",
      "answerType": "single-choice",
      "options": [
        { "value": "backend", "label": "Somente backend/API" },
        { "value": "frontend", "label": "Somente frontend" },
        { "value": "fullstack", "label": "Backend + frontend" }
      ],
      "blocking": true,
      "priority": 1,
      "reason": "Esta decisao define quais camadas serao planejadas.",
      "decisionRequired": "HUMAN_REQUIRED",
      "activation": null
    }
  ],
  "detectedUnknowns": [
    { "id": "u1", "dimension": "scope", "description": "Project scope not defined", "status": "OPEN", "blocking": true }
  ],
  "requirementsToAdd": [],
  "constraintsToAdd": []
}`;
  }

  _parseDiscoveryResponse(stdout) {
    if (!stdout || typeof stdout !== "string") {
      return { questions: [], detectedUnknowns: [], requirementsToAdd: [], constraintsToAdd: [] };
    }

    let text = extractAssistantText(stdout);
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1];

    try {
      const parsed = JSON.parse(text.trim());
      return {
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        detectedUnknowns: Array.isArray(parsed.detectedUnknowns) ? parsed.detectedUnknowns : [],
        requirementsToAdd: Array.isArray(parsed.requirementsToAdd) ? parsed.requirementsToAdd : [],
        constraintsToAdd: Array.isArray(parsed.constraintsToAdd) ? parsed.constraintsToAdd : []
      };
    } catch {
      return { questions: [], detectedUnknowns: [], requirementsToAdd: [], constraintsToAdd: [] };
    }
  }

  _buildQuestions(parsed) {
    if (!parsed || !Array.isArray(parsed.questions)) return [];
    return parsed.questions.map((q) => {
      try {
        return createBatchQuestion({
          id: q.id,
          unknownId: q.unknownId || null,
          dimension: q.dimension,
          group: q.group || q.dimension,
          text: q.text,
          answerType: q.answerType || "text",
          decisionRequired: typeof q.decisionRequired === "string" ? q.decisionRequired : undefined,
          options: Array.isArray(q.options) ? q.options : [],
          blocking: q.blocking !== false,
          priority: typeof q.priority === "number" ? q.priority : 10,
          reason: q.reason || "",
          evidenceKeys: q.evidenceKeys || [],
          activation: q.activation || null
        });
      } catch {
        return null;
      }
    }).filter(Boolean);
  }
}

module.exports = { BatchIntentDiscoverer };
