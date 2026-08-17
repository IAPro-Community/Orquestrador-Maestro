"use strict";

function getAnswer(answers, qId) {
  if (!answers) return undefined;
  if (typeof answers.get === "function") return answers.get(qId);
  return answers[qId];
}

function hasAnswer(answers, qId) {
  if (!answers) return false;
  if (typeof answers.has === "function") return answers.has(qId);
  return Object.prototype.hasOwnProperty.call(answers, qId);
}

function evaluateActivation(condition, answers) {
  if (!condition) return true;

  const evalSingle = (cond) => {
    const answer = getAnswer(answers, cond.questionId);
    switch (cond.operator) {
      case "equals":
        return answer === cond.values[0];
      case "notEquals":
        return answer !== cond.values[0];
      case "in":
        return Array.isArray(cond.values) && cond.values.includes(answer);
      case "notIn":
        return Array.isArray(cond.values) && !cond.values.includes(answer);
      case "answered":
        return answer !== undefined && answer !== null && answer !== "";
      default:
        return true;
    }
  };

  if (Array.isArray(condition.all)) return condition.all.every(evalSingle);
  if (Array.isArray(condition.any)) return condition.any.some(evalSingle);
  if (condition.questionId && condition.operator) return evalSingle(condition);
  return true;
}

function scheduleQuestions(questions, answers, intentSpec, options = {}) {
  if (!Array.isArray(questions) || questions.length === 0) return [];

  const batchSize = (options && options.batchSize) || 4;
  const includeAnswered = Boolean(options && options.includeAnswered);
  const showOptional = Boolean(options && options.showOptional);

  const active = [];
  for (const q of questions) {
    if (!evaluateActivation(q.activation, answers)) continue;
    if (!includeAnswered && hasAnswer(answers, q.id)) continue;
    if (q.decisionRequired === "OPTIONAL" && !showOptional && q.blocking !== true) continue;
    active.push(q);
  }

  active.sort((a, b) => {
    if (a.blocking && !b.blocking) return -1;
    if (!a.blocking && b.blocking) return 1;
    return (a.priority || 10) - (b.priority || 10);
  });

  return active.slice(0, batchSize);
}

module.exports = { scheduleQuestions, evaluateActivation };
