"use strict";

const COMPLEXITY_LEVELS = Object.freeze({
  SIMPLE: "simple",
  MEDIUM: "medium",
  COMPLEX: "complex",
  EXPERT: "expert"
});

// Padrões para classificação automática
const SIMPLE_PATTERNS = [
  /\b(ls|cd|mkdir|rm|cp|mv|cat|grep|find|echo|pwd|which|curl|wget)\b/i,
  /\b(npm\s+(install|i|ci|run|test|build)|yarn|pnpm|bun)\b/i,
  /\b(git\s+(status|log|diff|add|commit|push|pull|checkout|branch))\b/i,
  /\b(shell|comando|executar|rodar|instalar|listar)\b/i
];

const COMPLEX_PATTERNS = [
  /\b(arquitetura|architecture|design|planej|planejar|plan)\b/i,
  /\b(refatorar|refactor|migra|migrate|redesign)\b/i,
  /\b(crie|criar|construir|build|montar)\s.{20,}/i,  // Intenções longas
  /\b(clone|ifood|uber|airbnb|saas|dashboard)\b/i,
  /\b(prompt|spec|especificação|requisito)\b/i
];

const EXPERT_PATTERNS = [
  /\b(security|segurança|vulnerabilidade|pentest|audit)\b/i,
  /\b(performance|otimização|optimize|memory\s*leak)\b/i,
  /\b(migration|migração)\s.{30,}/i
];

// Configuração de modelos por provider e complexidade
const MODEL_MATRIX = Object.freeze({
  simple: {
    preferred: [
      { provider: "opencode", model: "deepseek/deepseek-chat-v4-0324", cost: 0.14 },
      { provider: "opencode", model: "groq/llama-3.3-70b", cost: 0 },
      { provider: "codex", model: "gpt-4o-mini", cost: 0.15 }
    ]
  },
  medium: {
    preferred: [
      { provider: "opencode", model: "deepseek/deepseek-reasoner-v4", cost: 0.44 },
      { provider: "codex", model: "gpt-4o-mini", cost: 0.15 },
      { provider: "claude", model: "claude-haiku-4", cost: 1.00 }
    ]
  },
  complex: {
    preferred: [
      { provider: "claude", model: "claude-sonnet-4-20250514", cost: 3.00 },
      { provider: "codex", model: "o3-mini", cost: 1.10 },
      { provider: "opencode", model: "deepseek/deepseek-reasoner-v4", cost: 0.44 }
    ]
  },
  expert: {
    preferred: [
      { provider: "claude", model: "claude-opus-4-20250514", cost: 15.00 },
      { provider: "claude", model: "claude-sonnet-4-20250514", cost: 3.00 },
      { provider: "codex", model: "o3", cost: 10.00 }
    ]
  }
});

function classifyComplexity(description) {
  if (EXPERT_PATTERNS.some((p) => p.test(description))) return COMPLEXITY_LEVELS.EXPERT;
  if (COMPLEX_PATTERNS.some((p) => p.test(description))) return COMPLEXITY_LEVELS.COMPLEX;
  if (SIMPLE_PATTERNS.some((p) => p.test(description))) return COMPLEXITY_LEVELS.SIMPLE;
  return COMPLEXITY_LEVELS.MEDIUM;
}

function selectModel(complexity, availableProviders = []) {
  const candidates = MODEL_MATRIX[complexity]?.preferred || MODEL_MATRIX.medium.preferred;
  // Prefer first available provider
  for (const candidate of candidates) {
    if (!availableProviders.length || availableProviders.includes(candidate.provider)) {
      return candidate;
    }
  }
  return candidates[0]; // Fallback to first
}

function estimateCost(tasks) {
  return tasks.reduce((total, task) => {
    const model = selectModel(task.complexity);
    // Rough estimate: ~2000 tokens input + ~4000 output per task
    const inputTokens = (task.estimatedInputTokens || 2000) / 1_000_000;
    const outputTokens = (task.estimatedOutputTokens || 4000) / 1_000_000;
    return total + (model.cost * inputTokens) + (model.cost * 3 * outputTokens);
  }, 0);
}

module.exports = {
  COMPLEXITY_LEVELS, MODEL_MATRIX,
  classifyComplexity, selectModel, estimateCost
};
