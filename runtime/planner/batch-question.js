"use strict";

const VALID_ANSWER_TYPES = ["text", "single-choice", "multi-choice", "boolean"];
const VALID_DECISION_REQUIRED = ["HUMAN_REQUIRED", "CONTEXT_CONFIRMABLE", "OPTIONAL"];

function createBatchQuestion(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("BatchQuestion input must be an object");
  }
  if (typeof input.id !== "string" || input.id.trim() === "") {
    throw new TypeError("BatchQuestion.id must be a non-empty string");
  }
  if (typeof input.dimension !== "string" || input.dimension.trim() === "") {
    throw new TypeError("BatchQuestion.dimension must be a non-empty string");
  }
  if (typeof input.text !== "string" || input.text.trim() === "") {
    throw new TypeError("BatchQuestion.text must be a non-empty string");
  }

  const answerType = input.answerType || "text";
  if (!VALID_ANSWER_TYPES.includes(answerType)) {
    throw new TypeError(`BatchQuestion.answerType must be one of: ${VALID_ANSWER_TYPES.join(", ")}`);
  }

  const decisionRequired = input.decisionRequired || "HUMAN_REQUIRED";
  if (!VALID_DECISION_REQUIRED.includes(decisionRequired)) {
    throw new TypeError(`BatchQuestion.decisionRequired must be one of: ${VALID_DECISION_REQUIRED.join(", ")}`);
  }

  const needsOptions = answerType === "single-choice" || answerType === "multi-choice";
  const options = Array.isArray(input.options) ? input.options : [];
  if (needsOptions && options.length === 0) {
    throw new TypeError(`BatchQuestion with answerType "${answerType}" requires at least one option`);
  }

  const values = options.map((o) => o.value);
  const uniqueValues = new Set(values);
  if (values.length !== uniqueValues.size) {
    throw new TypeError("BatchQuestion options contain duplicate values");
  }

  const frozenOptions = options.map((o) => Object.freeze({
    value: o.value,
    label: o.label || o.value,
    description: o.description || undefined,
    recommended: Boolean(o.recommended),
    evidenceKeys: Array.isArray(o.evidenceKeys) ? Object.freeze([...o.evidenceKeys]) : undefined
  }));

  let activation = input.activation || null;
  if (activation && typeof activation === "object") {
    activation = Object.freeze({
      all: Object.freeze((activation.all || []).map((cond) => Object.freeze({
        questionId: cond.questionId,
        operator: cond.operator,
        values: Object.freeze(Array.isArray(cond.values) ? [...cond.values] : [])
      })))
    });
  }

  return Object.freeze({
    id: input.id.trim(),
    unknownId: typeof input.unknownId === "string" ? input.unknownId.trim() : null,
    dimension: input.dimension.trim(),
    group: typeof input.group === "string" ? input.group.trim() : input.dimension.trim(),
    text: input.text.trim(),
    answerType,
    decisionRequired,
    options: Object.freeze(frozenOptions),
    blocking: input.blocking !== false,
    priority: typeof input.priority === "number" ? input.priority : 10,
    reason: typeof input.reason === "string" ? input.reason.trim() : "",
    evidenceKeys: Object.freeze(Array.isArray(input.evidenceKeys) ? [...input.evidenceKeys] : []),
    activation
  });
}

module.exports = { createBatchQuestion, VALID_ANSWER_TYPES, VALID_DECISION_REQUIRED };
