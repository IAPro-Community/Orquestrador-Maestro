"use strict";

class ClackBatchInteractionAdapter {
  constructor({ prompts } = {}) {
    this._prompts = prompts || require("@clack/prompts");
  }

  async collectBatch(questions, state) {
    const p = this._prompts;
    const batchNumber = state.batchNumber || 1;
    const totalQuestions = state.totalQuestions || questions.length;
    const answeredCount = state.answeredCount || 0;

    if (typeof p.note === "function") {
      p.note(
        `Encontramos ${totalQuestions} decisoes que precisam da sua confirmacao.\n` +
        `Vamos resolver primeiro ${questions.length} delas.\n\n` +
        `Progresso: ${answeredCount}/${totalQuestions}`,
        "Refinamento da missao"
      );
    }

    let answers = {};

    while (true) {
      answers = {};

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const prefix = `${i + 1}/${questions.length}`;
        const groupLabel = q.group || q.dimension;

        if (i === 0 || (q.group && q.group !== questions[i - 1].group)) {
          if (typeof p.log?.info === "function") {
            p.log.info(`\n\x1b[1m${groupLabel}\x1b[0m`);
          }
        }

        const answer = await this._promptQuestion(p, q, prefix, i);
        if (answer === null) return { action: "cancel", answers: {} };
        answers[q.id] = answer;
      }

      const summary = this._buildSummary(questions, answers);
      if (typeof p.note === "function") {
        p.note(summary, "Revise suas respostas");
      }

      const action = await p.select({
        message: "Como deseja continuar?",
        options: [
          { value: "confirm", label: "Confirmar respostas" },
          { value: "edit", label: "Alterar uma resposta" },
          { value: "cancel", label: "Cancelar missao" }
        ]
      });

      if (p.isCancel(action) || action === "cancel") {
        return { action: "cancel", answers: {} };
      }

      if (action === "confirm") {
        break;
      }

      if (action === "edit") {
        const editOptions = questions.map((q, idx) => ({
          value: q.id,
          label: `${idx + 1}. ${q.text.substring(0, 50)}${q.text.length > 50 ? "..." : ""}`
        }));

        const editTarget = await p.select({
          message: "Qual resposta deseja alterar?",
          options: editOptions
        });

        if (p.isCancel(editTarget)) continue;

        const targetQ = questions.find((q) => q.id === editTarget);
        if (targetQ) {
          const targetIdx = questions.indexOf(targetQ);
          const edited = await this._promptQuestion(p, targetQ, `edit/${targetIdx + 1}`, targetIdx);
          if (edited !== null) {
            answers[targetQ.id] = edited;
          }
        }
      }
    }

    if (typeof p.log?.success === "function") {
      p.log.success(`${questions.length} respostas confirmadas.`);
    }

    return { action: "confirm", answers };
  }

  async _promptQuestion(p, q, prefix, index) {
    if (q.answerType === "text") {
      const answer = await p.text({
        message: `\u2500 ${prefix} \u00b7 ${q.text}`,
        initialValue: ""
      });
      if (p.isCancel(answer)) return null;
      return answer;
    }

    if (q.answerType === "boolean") {
      const answer = await p.confirm({
        message: `\u2500 ${prefix} \u00b7 ${q.text}`
      });
      if (p.isCancel(answer)) return null;
      return answer;
    }

    if (q.answerType === "single-choice") {
      const options = (q.options || []).map((o) => ({
        value: o.value,
        label: (o.recommended ? "\u25cf " : "\u25cb ") + o.label,
        hint: o.description || undefined
      }));
      options.push({ value: "__outro__", label: "Outro..." });

      const answer = await p.select({
        message: `\u2500 ${prefix} \u00b7 ${q.text}`,
        options
      });
      if (p.isCancel(answer)) return null;
      if (answer === "__outro__") {
        const outroAnswer = await p.text({
          message: `\u2500 ${prefix} \u00b7 Defina: ${q.text}`,
          initialValue: ""
        });
        if (p.isCancel(outroAnswer)) return null;
        return outroAnswer;
      }
      return answer;
    }

    if (q.answerType === "multi-choice") {
      const options = (q.options || []).map((o) => ({
        value: o.value,
        label: (o.recommended ? "\u25cf " : "\u25cb ") + o.label,
        hint: o.description || undefined
      }));

      if (typeof p.multiselect === "function") {
        const answer = await p.multiselect({
          message: `\u2500 ${prefix} \u00b7 ${q.text}`,
          options
        });
        if (p.isCancel(answer)) return null;
        return answer;
      }

      const answer = await p.select({
        message: `\u2500 ${prefix} \u00b7 ${q.text}`,
        options
      });
      if (p.isCancel(answer)) return null;
      return answer;
    }

    const answer = await p.text({
      message: `\u2500 ${prefix} \u00b7 ${q.text}`,
      initialValue: ""
    });
    if (p.isCancel(answer)) return null;
    return answer;
  }

  _buildSummary(questions, answers) {
    const lines = [];
    for (const q of questions) {
      const answer = answers[q.id];
      const label = q.group || q.dimension;
      let display;
      if (answer === undefined || answer === null || answer === "") {
        display = "(sem resposta)";
      } else if (typeof answer === "boolean") {
        display = answer ? "Sim" : "Nao";
      } else if (q.answerType === "single-choice" && q.options) {
        const opt = q.options.find((o) => o.value === answer);
        display = opt ? opt.label : String(answer);
      } else {
        display = String(answer);
      }
      lines.push(`\x1b[1m${label}\x1b[0m\n  ${display}`);
    }
    return lines.join("\n\n");
  }
}

module.exports = { ClackBatchInteractionAdapter };
