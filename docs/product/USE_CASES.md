# Maestro — Casos de Uso (USE_CASES)

## Fix pequeno

```text
bug → contexto (brief+DEV) → skill → alteração → teste (verification engine)
```

## Feature

```text
intenção → contexto → planejamento → implementação → verificação → evidência
```

## Mudança arquitetural

```text
risco (governance) → architecture-first → plano → implementação → review independente
```

Só Codex suporta review read-only; demais providers retornam indisponível.

## Trabalho multiagente

```text
mission → graph → workspaces/worktrees isolados → integração manual → verificação
```

Sem merge automático: a integração de volta é manual e revisada.

## Continuação entre sessões

```text
DEV + memória episódica + estado de run/task → resume
```

Promoção para `DEV/` só via `memory promote --apply` com `verified:true`.

## Troca de ferramenta

Sobrevivem: regras, contexto, skills, memória, runs, evidência.
Dependem do provider: execução, sessão, permissões, streaming, review.

## Autopilot (limites reais)

`autopilot` = pipeline brief→requisitos→design→plano→implementação→QA→review→
handoff com evidência. Não é autonomia infinita: portões humanos, timeouts,
orçamento de contexto e verificação continuam valendo. Para “não pare até
concluir”, `ralph` (loop com verificação de arquiteto). Para N tarefas
independentes, `ultrawork` (paralelo puro, sem persistência). Para workers
duráveis em tmux, `team`/`worker`. `ralplan` só planeja (`plan --consensus`).
