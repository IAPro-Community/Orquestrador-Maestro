"use strict";

class BatchAnswerApplier {
  applyConfirmedAnswers(intentSpec, questions, confirmedAnswers) {
    if (!intentSpec || typeof intentSpec !== "object") throw new TypeError("intentSpec is required");
    if (!Array.isArray(questions)) throw new TypeError("questions is required");
    if (!confirmedAnswers || typeof confirmedAnswers.get !== "function") throw new TypeError("confirmedAnswers must be a Map");

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const newUserDecisions = [...(intentSpec.userDecisions || [])];
    const newUnknowns = (intentSpec.unknowns || []).map((u) => ({ ...u }));

    for (const [questionId, answer] of confirmedAnswers) {
      const question = questionMap.get(questionId);
      if (!question) continue;

      const dimension = question.dimension || questionId;
      const decisionText = `Decided ${dimension}: ${answer}`;
      newUserDecisions.push(decisionText);

      if (question.unknownId) {
        const unknown = newUnknowns.find((u) => u.id === question.unknownId);
        if (unknown && unknown.status === "OPEN") {
          unknown.status = "RESOLVED";
          unknown.metadata = {
            ...unknown.metadata,
            resolvedBy: "USER_DECISION",
            answeredAt: new Date().toISOString(),
            answer,
            questionId
          };
        }
      }
    }

    return Object.freeze({
      ...intentSpec,
      userDecisions: Object.freeze(newUserDecisions),
      unknowns: Object.freeze(newUnknowns.map((u) => Object.freeze(u))),
      updatedAt: new Date().toISOString()
    });
  }
}

module.exports = { BatchAnswerApplier };
