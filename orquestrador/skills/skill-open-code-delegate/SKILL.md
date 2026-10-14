---
name: skill-open-code-delegate
description: DEPRECATED — use skill-multiagent-orchestration. Alias de compatibilidade para instalações pré-1.1.0. Será removido futuramente.
category: orchestration
risk: low
source: orquestrador-compat-1.1.0
---

# skill-open-code-delegate (deprecated)

> **Aviso de depreciação (1.1.0):** esta skill é um alias de compatibilidade.
> Use `skill-multiagent-orchestration` para delegação, subagentes e execução em equipe.
> Será removida em release futura.

## Migração

- Antes: `skill-open-code-delegate`
- Agora: `skill-multiagent-orchestration` (`orquestrador/skills/skill-multiagent-orchestration/SKILL.md`)
- Router e manifest preservam este alias apenas para não quebrar instalações antigas (issue #38).

## Ação

Roteie para `skill-multiagent-orchestration`. Não adicione lógica nova aqui.
