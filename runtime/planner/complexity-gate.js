"use strict";

const COMPLEXITY_LEVELS = Object.freeze(["MICRO", "SIMPLE", "STANDARD", "COMPLEX", "DEEP"]);

const COMPLEXITY_BUDGETS = Object.freeze({
  MICRO: Object.freeze({
    maxSkills: 1,
    maxContextTokens: 1500,
    maxReferences: 0,
    planningDepth: "none",
    verificationDepth: "light",
    allowSubagents: false
  }),
  SIMPLE: Object.freeze({
    maxSkills: 1,
    maxContextTokens: 3000,
    maxReferences: 1,
    planningDepth: "light",
    verificationDepth: "targeted",
    allowSubagents: false
  }),
  STANDARD: Object.freeze({
    maxSkills: 3,
    maxContextTokens: 6000,
    maxReferences: 2,
    planningDepth: "standard",
    verificationDepth: "task-appropriate",
    allowSubagents: false
  }),
  COMPLEX: Object.freeze({
    maxSkills: 4,
    maxContextTokens: 10000,
    maxReferences: 4,
    planningDepth: "deep",
    verificationDepth: "strict",
    allowSubagents: false
  }),
  DEEP: Object.freeze({
    maxSkills: 5,
    maxContextTokens: 16000,
    maxReferences: 6,
    planningDepth: "deep",
    verificationDepth: "strict",
    allowSubagents: false
  })
});

const MICRO_PATTERNS = Object.freeze([
  /^git\s+(status|diff|add|stage)(?:\s|$)/iu,
  /^(faça|faca|fazer|crie|gere)?\s*(um\s+)?git\s+commit\b/iu,
  /^(commit|commitar)\b.*\b(alterações|alteracoes|mudanças|mudancas|changes)?\s*$/iu,
  /^(corrija|corrigir|ajuste|ajustar)\s+(um\s+)?(typo|erro de digitação|erro de digitacao)\b/iu,
  /^(renomeie|renomear)\s+(uma?\s+)?(variável|variavel|constante|arquivo)\b/iu,
  /^(formate|formatar)\s+(este|esse|o)\s+arquivo\b/iu
]);

const SIMPLE_PATTERNS = Object.freeze([
  /\badicionar\s+(um\s+)?teste\s+(unitário|unitario)?\s*(para|de)\b/iu,
  /\bcorrigir\s+(um\s+)?(overflow|label|texto|copy|ícone|icone|spacing|espaçamento|espacamento)\b/iu,
  /\bajustar\s+(uma\s+)?(função|funcao|componente|query|configuração|configuracao)\b/iu,
  /\bpequena\s+(correção|correcao|alteração|alteracao)\b/iu
]);

const COMPLEX_PATTERNS = Object.freeze([
  /\bmigr(ar|e|ação|acao).*\b(auth|autenticação|autenticacao|database|banco|framework|design system)\b/iu,
  /\b(auth|autenticação|autenticacao|authorization|autorização|autorizacao)\b.*\b(mudar|alterar|migrar|reestruturar|redesign)\b/iu,
  /\b(produção|producao|production)\b.*\b(migração|migracao|schema|segurança|seguranca|deploy)\b/iu,
  /\b(reestruturar|refatorar)\b.*\b(módulo|modulo|arquitetura|serviço|servico)\b/iu,
  /\b(novo|nova)\s+(módulo|modulo|serviço|servico|subsistema)\b/iu,
  /\bsecurity\s+audit\b|\bauditoria\s+de\s+segurança\b/iu
]);

const DEEP_PATTERNS = Object.freeze([
  /\b(reestruturar|redesenhar|reescrever)\b.*\b(arquitetura inteira|sistema inteiro|aplicação inteira|aplicacao inteira|monorepo inteiro)\b/iu,
  /\b(full|complete|entire)\s+(rewrite|architecture|redesign|migration)\b/iu,
  /\b(múltiplos|multiplos|vários|varios)\s+(serviços|servicos|módulos|modulos|workspaces|packages)\b.*\b(migrar|reestruturar|redesenhar)\b/iu,
  /\bwhole\s+(codebase|platform|product)\b/iu
]);

const HIGH_RISK_TERMS = Object.freeze([
  "produção",
  "producao",
  "production",
  "pagamento",
  "payment",
  "billing",
  "autenticação",
  "autenticacao",
  "authentication",
  "autorização",
  "autorizacao",
  "authorization",
  "segurança",
  "seguranca",
  "security",
  "migration",
  "migração",
  "migracao",
  "schema",
  "rls"
]);

const MULTIAGENT_TERMS = Object.freeze([
  "multiagent",
  "multi-agent",
  "subagents",
  "subagentes",
  "parallel agents",
  "agentes paralelos",
  "swarm",
  "team execution"
]);

function normalizeIntent(value) {
  return String(value || "").trim().replace(/\s+/gu, " ");
}

function containsAny(text, terms) {
  const normalized = text.toLocaleLowerCase("pt-BR");
  return terms.filter((term) => normalized.includes(term.toLocaleLowerCase("pt-BR")));
}

function strongestMinimum(left, right) {
  return COMPLEXITY_LEVELS.indexOf(left) >= COMPLEXITY_LEVELS.indexOf(right) ? left : right;
}

function classifyComplexity(intent, options = {}) {
  const text = normalizeIntent(intent);
  const classificationText = text.replace(
    /^(?:(?:use|usar|utilize|utilizar)\s+)?(?:multiagent|multi-agent|subagents?|subagentes?|swarm|team)(?:\s+execution)?\s*(?:para\s+)?/iu,
    ""
  ).trim();
  const evidence = [];
  const changedFiles = Array.isArray(options.changedFiles) ? options.changedFiles.filter(Boolean) : [];
  const explicitMultiagent = options.explicitMultiagent === true || containsAny(text, MULTIAGENT_TERMS).length > 0;

  let level = "STANDARD";
  const overrideLevel = options.overrideLevel == null ? null : String(options.overrideLevel).trim().toUpperCase();
  if (overrideLevel && !COMPLEXITY_LEVELS.includes(overrideLevel)) {
    throw new TypeError(`complexity override must be one of: ${COMPLEXITY_LEVELS.join(", ")}`);
  }

  const deep = DEEP_PATTERNS.find((pattern) => pattern.test(classificationText));
  const complex = COMPLEX_PATTERNS.find((pattern) => pattern.test(classificationText));
  const simple = SIMPLE_PATTERNS.find((pattern) => pattern.test(classificationText));
  const micro = MICRO_PATTERNS.find((pattern) => pattern.test(classificationText));
  const highRiskTerms = containsAny(text, HIGH_RISK_TERMS);

  if (deep) {
    level = "DEEP";
    evidence.push(Object.freeze({ kind: "deep-pattern", value: deep.source }));
  } else if (complex) {
    level = "COMPLEX";
    evidence.push(Object.freeze({ kind: "complex-pattern", value: complex.source }));
  } else if (micro && highRiskTerms.length === 0) {
    level = "MICRO";
    evidence.push(Object.freeze({ kind: "micro-pattern", value: micro.source }));
  } else if (simple && highRiskTerms.length === 0) {
    level = "SIMPLE";
    evidence.push(Object.freeze({ kind: "simple-pattern", value: simple.source }));
  }

  if (highRiskTerms.length > 0) {
    level = strongestMinimum(level, "COMPLEX");
    evidence.push(Object.freeze({ kind: "risk-escalation", value: highRiskTerms.join(", ") }));
  }

  if (changedFiles.length >= 20) {
    level = strongestMinimum(level, "DEEP");
    evidence.push(Object.freeze({ kind: "scope-files", value: String(changedFiles.length) }));
  } else if (changedFiles.length >= 8) {
    level = strongestMinimum(level, "COMPLEX");
    evidence.push(Object.freeze({ kind: "scope-files", value: String(changedFiles.length) }));
  } else if (changedFiles.length >= 3) {
    level = strongestMinimum(level, "STANDARD");
    evidence.push(Object.freeze({ kind: "scope-files", value: String(changedFiles.length) }));
  }

  if (explicitMultiagent) {
    evidence.push(Object.freeze({ kind: "multiagent-requested", value: "explicit" }));
  }

  if (overrideLevel) {
    const riskFloor = highRiskTerms.length > 0 ? "COMPLEX" : null;
    if (riskFloor && COMPLEXITY_LEVELS.indexOf(overrideLevel) < COMPLEXITY_LEVELS.indexOf(riskFloor)) {
      throw new TypeError(`complexity override ${overrideLevel} cannot go below risk floor ${riskFloor}`);
    }
    level = overrideLevel;
    evidence.push(Object.freeze({ kind: "explicit-override", value: overrideLevel }));
  }

  const baseBudget = COMPLEXITY_BUDGETS[level];
  const budget = Object.freeze({
    ...baseBudget,
    allowSubagents: explicitMultiagent && ["COMPLEX", "DEEP"].includes(level)
  });

  return Object.freeze({
    level,
    profile: level === "MICRO" || level === "SIMPLE"
      ? "fast"
      : level === "STANDARD"
        ? "standard"
        : level === "COMPLEX"
          ? "guided-engineering"
          : "deep",
    budget,
    explicitMultiagent,
    evidence: Object.freeze(evidence),
    rationale: evidence.length > 0
      ? evidence.map((item) => `${item.kind}:${item.value}`).join(" | ")
      : "default-standard"
  });
}

module.exports = {
  COMPLEXITY_BUDGETS,
  COMPLEXITY_LEVELS,
  classifyComplexity,
  normalizeIntent
};
