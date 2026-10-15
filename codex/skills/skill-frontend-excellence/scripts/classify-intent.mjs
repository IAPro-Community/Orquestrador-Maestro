#!/usr/bin/env node
/**
 * Classify a natural-language frontend request.
 * Usage: node classify-intent.mjs "migre MUI para o design system do projeto"
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const CREATIVITY_RANK = { none: 0, low: 1, medium: 2, high: 3 };

const RULES = [
  {
    intent: "MIGRATE",
    posture: "PRESERVE",
    creativity: "none",
    pattern:
      /\b(migr(?:a|e|ar)|migração|migracao|troca(?:r)?\s+(mui|bootstrap)|design system)\b/i,
  },
  {
    intent: "REFACTOR",
    posture: "PRESERVE",
    creativity: "none",
    pattern:
      /\b(refator(?:e|ar|ação|acao)|typescript|troca(?:r)?\s+router|performance|atualiza(?:r)?\s+react|code\s*split)\b/i,
  },
  {
    intent: "FIX",
    posture: "PRESERVE",
    creativity: "low",
    pattern: /\b(corrig(?:e|ir|a)|bug|quebra(?:do)?|overflow|contraste|mobile|responsiv)/i,
  },
  {
    intent: "REVIEW",
    posture: "PRESERVE",
    creativity: "low",
    pattern: /\b(revis(?:e|ar|ão|ao)|audite|critique|visual review|definition of done)\b/i,
  },
  {
    intent: "REDESIGN",
    posture: "EXPLORE",
    creativity: "high",
    pattern: /\b(moderniz|redesenh|nova identidade|redesign|rebrand)/i,
  },
  {
    intent: "CREATE",
    posture: "EVOLVE",
    creativity: "medium",
    pattern: /\b(cri(?:e|ar)|adicion(?:e|ar)|nova tela|novo fluxo|novo formulário|novo formulario)\b/i,
  },
  {
    intent: "IMPROVE",
    posture: "EVOLVE",
    creativity: "low",
    pattern: /\b(melhor(?:e|ar)|refine|polimento|acessibilidade|ux|espaçamento|espacamento)\b/i,
  },
];

function classifyIntent(text, profileCreativity) {
  const source = String(text || "").trim();
  if (!source) {
    return {
      intent: "REVIEW",
      posture: "PRESERVE",
      creativity: "none",
      reason: "empty-request",
    };
  }

  let matched = RULES.find((rule) => rule.pattern.test(source));
  if (!matched) {
    matched = {
      intent: "IMPROVE",
      posture: "EVOLVE",
      creativity: "low",
      reason: "default-improve",
    };
  }

  const result = {
    intent: matched.intent,
    posture: matched.posture,
    creativity: matched.creativity,
    reason: matched.reason || matched.intent,
    request: source,
  };

  if (/\bmobile\b/i.test(source) && result.intent === "FIX") {
    result.creativity = "low";
    result.posture = "PRESERVE";
  }

  if (profileCreativity) {
    const allowed = CREATIVITY_RANK[String(profileCreativity).toLowerCase()];
    const current = CREATIVITY_RANK[result.creativity];
    if (Number.isInteger(allowed) && current > allowed) {
      result.creativity = String(profileCreativity).toLowerCase();
      result.profileCapped = true;
    }
  }

  if (result.intent === "MIGRATE" || result.intent === "REFACTOR") {
    result.posture = "PRESERVE";
    result.creativity = "none";
  }

  return result;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const request = process.argv.slice(2).join(" ");
  const profileArg = process.env.DESIGN_PROFILE_CREATIVITY;
  const result = classifyIntent(request, profileArg);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export { classifyIntent, CREATIVITY_RANK };
