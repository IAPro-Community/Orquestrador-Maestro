<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-scope-control

Analisa se alterações, diffs e PRs continuam alinhados ao objetivo declarado, identificando escopo extra e propondo manter, separar ou justificar.

| Campo | Valor |
| --- | --- |
| Categoria | governance |
| Risco | medium |
| Disponibilidade | Sob demanda |
| Tags | governance, scope, control |
| Aliases | escopo |

## Melhores casos de uso

- Analisa se alterações, diffs e PRs continuam alinhados ao objetivo declarado, identificando escopo extra e propondo manter, separar ou justificar.

## Quando não usar

- Pedidos fora do domínio governance; use a skill específica quando houver uma intenção mais precisa.

## Exemplos de pedidos reconhecidos

- Use para escopo da mudança.
- Use para o diff saiu do escopo.
- Use para alteração grande demais.
- Use para essa alteração ficou grande demais.
- Use para o pr está misturado.

## Pré-requisitos e ferramentas externas

- Contexto do projeto e autorização compatíveis com o risco medium.

## Compatibilidade e instalação

| Client | Disponibilidade | Raiz/política |
| --- | --- | --- |
| agents | Sob demanda | .agents/skills |
| antigravity | Sob demanda | .antigravity-skills/skills |
| claude | Sob demanda | .claude/skills |
| codex | Sob demanda | .codex/skills |
| cursor | Sob demanda | .cursor/skills |
| gemini | Sob demanda | .gemini/skills |
| opencode | Sob demanda | .opencode/skills |
| windsurf | Sob demanda | .windsurf/skills |

A skill permanece no catálogo canônico e é disponibilizada sob demanda; ela não ocupa uma raiz nativa por padrão.

## Recipes e chains relacionadas

- Recipe `release-readiness`: Preparação de release
- Chain `skill-scope-control`

## Evidência mínima de conclusão

- Resultado solicitado demonstrado por teste, inspeção ou artefato verificável.
- Handoff com limitações e próximo passo quando aplicável.

Perfil de workflow: `standard` (entrada: `SKILL.md`).

## Proveniência

- Upstream: https://github.com/shubhamsaboo/awesome-llm-apps/tree/main/scope-creep-detector
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-13
- Evidências: `orquestrador/skills/skill-scope-control/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-scope-control/SKILL.md`](../../../orquestrador/skills/skill-scope-control/SKILL.md)
