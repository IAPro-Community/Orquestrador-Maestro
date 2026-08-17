"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const AMBIGUITY_THRESHOLD = 0.25;
const MAX_ROUNDS = 8;

// Dimensões de clareza com pesos (baseado no deep-interview)
const DIMENSIONS = {
  intent:      { weight: 0.25, label: "Intenção (por quê?)" },
  outcome:     { weight: 0.20, label: "Resultado esperado" },
  scope:       { weight: 0.20, label: "Escopo (até onde vai?)" },
  constraints: { weight: 0.15, label: "Restrições técnicas" },
  criteria:    { weight: 0.10, label: "Critérios de sucesso" },
  nonGoals:    { weight: 0.10, label: "Não-objetivos" }
};

/**
 * Entrevista dinâmica guiada por skills.
 * Não usa perguntas fixas — gera cada pergunta com base nos gaps das skills.
 */
class DynamicInterviewer {
  constructor({ resolvedSkills, preflightFacts, skillsRoot }) {
    this.resolvedSkills = resolvedSkills;
    this.facts = { ...preflightFacts };
    this.skillsRoot = skillsRoot || path.join(require("os").homedir(), ".orquestrador", "skills");
    this.rounds = [];
    this.clarity = {};
    for (const dim of Object.keys(DIMENSIONS)) {
      this.clarity[dim] = 0.0;
    }
    // Auto-fill clarity from known facts
    this._applyFactClarity();
  }

  /**
   * Aumenta a clareza automaticamente com base nos fatos já descobertos.
   */
  _applyFactClarity() {
    // Se já sabemos o stack, constraints fica parcialmente clara
    if (this.facts.stack) this.clarity.constraints = Math.max(this.clarity.constraints, 0.4);
    if (this.facts.framework) this.clarity.constraints = Math.max(this.clarity.constraints, 0.6);
    // Se tem auth/database/payments, scope fica parcialmente clara
    if (this.facts.hasAuth || this.facts.hasDatabase) this.clarity.scope = Math.max(this.clarity.scope, 0.3);
    // Se tem DEV state, intent e outcome ficam parcialmente claros
    if (this.facts.devState) {
      this.clarity.intent = Math.max(this.clarity.intent, 0.3);
      this.clarity.outcome = Math.max(this.clarity.outcome, 0.3);
    }
  }

  /**
   * Calcula o ambiguity score (0 = perfeito, 1 = totalmente ambíguo)
   */
  calculateAmbiguity() {
    let weightedSum = 0;
    for (const [dim, config] of Object.entries(DIMENSIONS)) {
      weightedSum += config.weight * this.clarity[dim];
    }
    return 1 - weightedSum;
  }

  /**
   * Identifica a dimensão com menor clareza para focar a próxima pergunta.
   */
  weakestDimension() {
    let weakest = null;
    let lowestScore = Infinity;
    for (const [dim, score] of Object.entries(this.clarity)) {
      if (score < lowestScore) {
        lowestScore = score;
        weakest = dim;
      }
    }
    return { dimension: weakest, score: lowestScore, label: DIMENSIONS[weakest]?.label };
  }

  /**
   * Carrega os critérios mínimos de aceitação das skills resolvidas.
   * Estes critérios definem o que precisa ser respondido.
   */
  loadSkillCriteria() {
    const criteria = [];
    for (const skill of this.resolvedSkills) {
      const skillPath = path.join(this.skillsRoot, skill.id, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;

      const content = fs.readFileSync(skillPath, "utf8");
      // Extrair seções relevantes para refinamento
      const sections = {
        surfaces: extractSection(content, "Surfaces", "Standard_SaaS_Baseline"),
        acceptance: extractSection(content, "Minimum_Acceptance", "Acceptance_Criteria", "Final_Checklist"),
        guardrails: extractSection(content, "Guardrails", "Safety", "Execution_Policy")
      };

      if (Object.values(sections).some(Boolean)) {
        criteria.push({ skillId: skill.id, ...sections });
      }
    }
    return criteria;
  }

  /**
   * Gera a próxima pergunta com base nos gaps.
   * Retorna null se ambiguidade já é suficientemente baixa.
   */
  generateQuestion() {
    const ambiguity = this.calculateAmbiguity();
    if (ambiguity <= AMBIGUITY_THRESHOLD) return null;
    if (this.rounds.length >= MAX_ROUNDS) return null;

    const weakest = this.weakestDimension();
    const skillCriteria = this.loadSkillCriteria();

    // Gerar pergunta contextualizada
    return this._buildContextualQuestion(weakest, skillCriteria);
  }

  /**
   * Constrói uma pergunta contextualizada usando fatos conhecidos e skills.
   */
  _buildContextualQuestion(weakest, skillCriteria) {
    const { dimension } = weakest;
    const generators = {
      intent: () => this._intentQuestion(),
      outcome: () => this._outcomeQuestion(skillCriteria),
      scope: () => this._scopeQuestion(skillCriteria),
      constraints: () => this._constraintsQuestion(),
      criteria: () => this._criteriaQuestion(skillCriteria),
      nonGoals: () => this._nonGoalsQuestion()
    };

    const question = generators[dimension]?.() || {
      text: "Pode detalhar melhor o que espera desse projeto?",
      dimension,
      options: []
    };

    return {
      round: this.rounds.length + 1,
      ambiguity: this.calculateAmbiguity(),
      targetDimension: dimension,
      dimensionLabel: DIMENSIONS[dimension].label,
      ...question
    };
  }

  _intentQuestion() {
    // Contextualizar com o que já sabemos
    if (this.facts.stack) {
      return {
        text: `Encontrei um projeto ${this.facts.stack} existente. Este novo trabalho é para:\n` +
              `  1. Evoluir esse projeto existente\n` +
              `  2. Criar um projeto novo do zero\n` +
              `  3. Usar como referência para criar algo diferente`,
        options: ["evoluir", "novo", "referência"]
      };
    }
    return {
      text: "Qual é o objetivo principal? O que motiva esse trabalho?",
      options: []
    };
  }

  _outcomeQuestion(skillCriteria) {
    // Usar acceptance criteria das skills para perguntar sobre outcome
    const surfaces = skillCriteria
      .flatMap((c) => this._parseSurfaces(c.surfaces))
      .filter(Boolean);

    if (surfaces.length > 0) {
      return {
        text: `Com base no tipo de projeto, estas são as superfícies padrão:\n` +
              surfaces.map((s, i) => `  ${i + 1}. ${s}`).join("\n") +
              `\n\nQuais são prioridade para a v1?`,
        options: surfaces
      };
    }
    return {
      text: "Descreva o resultado final que você quer ver funcionando.",
      options: []
    };
  }

  _scopeQuestion(skillCriteria) {
    const guardrails = skillCriteria
      .flatMap((c) => this._parseGuardrails(c.guardrails))
      .filter(Boolean);

    if (this.facts.hasPayments) {
      return {
        text: `Detectei dependências de pagamento no projeto. Para o escopo de billing:\n` +
              `  1. Usar o provider já configurado (${this.facts.hasPayments})\n` +
              `  2. Trocar para outro provider\n` +
              `  3. Não incluir pagamentos na v1`,
        options: ["manter", "trocar", "sem pagamentos"]
      };
    }

    return {
      text: "Até onde esse trabalho deve ir? O que está dentro e fora do escopo?",
      options: []
    };
  }

  _constraintsQuestion() {
    if (this.facts.stack && this.facts.framework) {
      return {
        text: `O projeto usa ${this.facts.stack} com ${this.facts.framework}. Devo manter essa stack ou há mudanças desejadas?\n` +
              `  Deps detectadas: ${Object.keys(this.facts.dependencies).slice(0, 10).join(", ")}`,
        options: ["manter stack", "mudar stack"]
      };
    }
    return {
      text: "Há restrições técnicas? (stack, hosting, performance, orçamento de API)",
      options: []
    };
  }

  _criteriaQuestion(skillCriteria) {
    const acceptance = skillCriteria
      .flatMap((c) => this._parseAcceptance(c.acceptance))
      .filter(Boolean);

    if (acceptance.length > 0) {
      return {
        text: `As skills sugerem estes critérios mínimos de aceitação:\n` +
              acceptance.map((a, i) => `  ${i + 1}. ${a}`).join("\n") +
              `\n\nAlgo a adicionar, remover ou ajustar?`,
        options: ["aceitar", "ajustar"]
      };
    }
    return {
      text: "Como vamos saber que o trabalho está completo? Quais critérios de sucesso?",
      options: []
    };
  }

  _nonGoalsQuestion() {
    return {
      text: "O que explicitamente NÃO deve ser feito neste trabalho? (features a excluir, complexidades a evitar)",
      options: []
    };
  }

  /**
   * Registra a resposta do usuário e atualiza a clareza.
   */
  recordAnswer(question, answer) {
    this.rounds.push({ question, answer, timestamp: new Date().toISOString() });

    // Aumentar clareza da dimensão alvo
    const dim = question.targetDimension;
    const increase = answer.trim().length > 20 ? 0.7 : 0.4; // Respostas detalhadas valem mais
    this.clarity[dim] = Math.min(1.0, this.clarity[dim] + increase);
  }

  /**
   * Executa o loop de entrevista interativo.
   * Retorna a spec refinada.
   */
  async runInteractive() {
    const p = require("@clack/prompts");

    let question = this.generateQuestion();
    while (question) {
      const ambPct = (question.ambiguity * 100).toFixed(0);

      let answer;
      if (question.options && question.options.length > 0) {
        answer = await p.select({
          message: `[Ambiguidade: ${ambPct}%] ${question.text}`,
          options: [
            ...question.options.map(o => ({ value: o, label: o })),
            { value: "skip", label: "Pular pergunta (manter ambiguidade)" }
          ]
        });
      } else {
        answer = await p.text({
          message: `[Ambiguidade: ${ambPct}%] ${question.text}`,
          placeholder: "Digite sua resposta ou 'skip' para pular...",
          defaultValue: ""
        });
      }

      if (p.isCancel(answer) || answer === "skip" || answer === "q") {
        p.note("Prosseguindo com ambiguidade residual.", "Aviso");
        break;
      }

      this.recordAnswer(question, answer);
      question = this.generateQuestion();
    }

    const finalAmbiguity = this.calculateAmbiguity();
    p.note(`✓ Ambiguidade final: ${(finalAmbiguity * 100).toFixed(0)}%\n✓ ${this.rounds.length} perguntas respondidas`, "Concluído");

    return this.buildSpec();
  }

  /**
   * Modo batch — preenche tudo com fatos conhecidos e valores default.
   */
  runBatch() {
    // Em modo batch, usar fatos pré-descobertos para maximizar clareza
    for (const dim of Object.keys(this.clarity)) {
      if (this.clarity[dim] < 0.5) this.clarity[dim] = 0.5; // Assume defaults
    }
    return this.buildSpec();
  }

  /**
   * Constrói a spec refinada para o TaskDecomposer.
   */
  buildSpec() {
    return Object.freeze({
      ambiguity: this.calculateAmbiguity(),
      clarity: { ...this.clarity },
      rounds: this.rounds,
      facts: this.facts,
      skills: this.resolvedSkills,
      answers: Object.fromEntries(this.rounds.map((r) => [r.question.targetDimension, r.answer]))
    });
  }

  // Helpers para parsear conteúdo de SKILL.md
  _parseSurfaces(text) {
    if (!text) return [];
    return text.split("\n").filter((l) => l.match(/^\s*[-*]\s/)).map((l) => l.replace(/^\s*[-*]\s*/, "").trim()).slice(0, 10);
  }

  _parseGuardrails(text) {
    if (!text) return [];
    return text.split("\n").filter((l) => l.match(/^\s*[-*]\s/)).map((l) => l.replace(/^\s*[-*]\s*/, "").trim()).slice(0, 5);
  }

  _parseAcceptance(text) {
    if (!text) return [];
    return text.split("\n").filter((l) => l.match(/^\s*[-*\d.]\s/)).map((l) => l.replace(/^\s*[-*\d.]+\s*/, "").trim()).slice(0, 8);
  }
}

function extractSection(content, ...sectionNames) {
  for (const name of sectionNames) {
    const regex = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i");
    const match = content.match(regex);
    if (match) return match[1].trim();
    // Also try markdown headers
    const headerRegex = new RegExp(`#+\\s*${name}[\\s\\S]*?(?=\\n#+\\s|$)`, "i");
    const headerMatch = content.match(headerRegex);
    if (headerMatch) return headerMatch[0].trim();
  }
  return null;
}

module.exports = { DynamicInterviewer, AMBIGUITY_THRESHOLD, MAX_ROUNDS, DIMENSIONS };
