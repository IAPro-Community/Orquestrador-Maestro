---
name: skill-open-code-review
description: DEPRECATED — use code-review. Alias de compatibilidade para instalações pré-1.1.0. Será removido futuramente.
category: review
risk: low
source: orquestrador-compat-1.1.0
---

# skill-open-code-review (deprecated)

> **Aviso de depreciação (1.1.0):** esta skill é um alias de compatibilidade.
> Use `code-review` (revisão abrangente) ou `review-agent` (agente de revisão).
> Será removida em release futura.

## Migração

- Antes: `skill-open-code-review`
- Agora: `code-review` (`codex/skills/code-review/SKILL.md`) + `review-agent` (`codex/skills/.system/review-agent/SKILL.md`)
- Router e manifest preservam este alias apenas para não quebrar instalações antigas (issue #38).

## Ação

Roteie para `code-review`. Não adicione lógica nova aqui.
