"use strict";

const SUPPORTED_OPERATORS = ["equals", "notEquals", "in", "notIn", "answered"];

function validateQuestionSet(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return Object.freeze({ valid: true, blockers: Object.freeze([]), warnings: Object.freeze([]) });
  }

  const blockers = [];
  const warnings = [];
  const ids = new Set();

  for (const q of questions) {
    if (ids.has(q.id)) {
      blockers.push({ code: "DUPLICATE_QUESTION_ID", message: `Duplicate question ID: ${q.id}`, questionId: q.id });
    }
    ids.add(q.id);
  }

  const idSet = new Set(questions.map((q) => q.id));

  for (const q of questions) {
    if (q.answerType === "single-choice" || q.answerType === "multi-choice") {
      if (!q.options || q.options.length === 0) {
        blockers.push({ code: "MISSING_OPTIONS", message: `Question "${q.id}" requires options for ${q.answerType}`, questionId: q.id });
      } else {
        const values = q.options.map((o) => o.value);
        const uniqueValues = new Set(values);
        if (values.length !== uniqueValues.size) {
          blockers.push({ code: "DUPLICATE_OPTION_VALUES", message: `Question "${q.id}" has duplicate option values`, questionId: q.id });
        }
      }
    }

    if (q.activation && q.activation.all) {
      for (const cond of q.activation.all) {
        if (!SUPPORTED_OPERATORS.includes(cond.operator)) {
          blockers.push({
            code: "UNSUPPORTED_OPERATOR",
            message: `Question "${q.id}" uses unsupported operator: ${cond.operator}`,
            questionId: q.id
          });
        }

        if (cond.questionId === q.id) {
          blockers.push({
            code: "SELF_DEPENDENCY",
            message: `Question "${q.id}" depends on itself`,
            questionId: q.id
          });
        }

        if (cond.questionId && !idSet.has(cond.questionId)) {
          blockers.push({
            code: "DANGLING_DEPENDENCY",
            message: `Question "${q.id}" depends on unknown question "${cond.questionId}"`,
            questionId: q.id,
            dependencyId: cond.questionId
          });
        }
      }
    }
  }

  const adjacency = new Map();
  for (const q of questions) {
    adjacency.set(q.id, []);
  }
  for (const q of questions) {
    if (q.activation && q.activation.all) {
      for (const cond of q.activation.all) {
        if (adjacency.has(cond.questionId)) {
          adjacency.get(cond.questionId).push(q.id);
        }
      }
    }
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const q of questions) color.set(q.id, WHITE);

  function dfs(node, path) {
    color.set(node, GRAY);
    path.add(node);
    for (const neighbor of (adjacency.get(node) || [])) {
      if (color.get(neighbor) === GRAY) {
        const cycleNodes = [...path].filter((_, i) => i >= [...path].indexOf(neighbor));
        return { code: "CIRCULAR_DEPENDENCY", message: `Circular dependency detected: ${cycleNodes.join(" -> ")} -> ${neighbor}`, nodes: cycleNodes };
      }
      if (color.get(neighbor) === WHITE) {
        const result = dfs(neighbor, path);
        if (result) return result;
      }
    }
    path.delete(node);
    color.set(node, BLACK);
    return null;
  }

  for (const q of questions) {
    if (color.get(q.id) === WHITE) {
      const cycle = dfs(q.id, new Set());
      if (cycle) {
        blockers.push(cycle);
        break;
      }
    }
  }

  return Object.freeze({
    valid: blockers.length === 0,
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings)
  });
}

module.exports = { validateQuestionSet, SUPPORTED_OPERATORS };
