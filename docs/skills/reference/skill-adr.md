<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-adr

Registros de decisões arquiteturais com alternativas e consequências.

| Campo | Valor |
| --- | --- |
| Categoria | architecture |
| Risco | low |
| Disponibilidade | Nativa |
| Tags | architecture, adr |
| Aliases | adr |

## Melhores casos de uso

- Registros de decisões arquiteturais com alternativas e consequências.

## Quando não usar

- Pedidos fora do domínio architecture; use a skill específica quando houver uma intenção mais precisa.

## Exemplos de pedidos reconhecidos

- Use para adr.
- Use para decisão arquitetural.
- Use para architecture decision.

## Pré-requisitos e ferramentas externas

- Contexto do projeto e autorização compatíveis com o risco low.

## Compatibilidade e instalação

| Client | Disponibilidade | Raiz/política |
| --- | --- | --- |
| agents | Nativa | .agents/skills |
| antigravity | Nativa | .antigravity-skills/skills |
| claude | Nativa | .claude/skills |
| codex | Nativa | .codex/skills |
| cursor | Nativa | .cursor/skills |
| gemini | Nativa | .gemini/skills |
| opencode | Nativa | .opencode/skills |
| windsurf | Nativa | .windsurf/skills |

A skill é sincronizada para as raízes nativas configuradas pela política de instalação.

## Recipes e chains relacionadas

- Recipe `research-and-decision`: Pesquisa com fontes e decisão registrada
- Nenhuma chain registrada.

## Evidência mínima de conclusão

- Resultado solicitado demonstrado por teste, inspeção ou artefato verificável.
- Handoff com limitações e próximo passo quando aplicável.

Perfil de workflow: `standard` (entrada: `SKILL.md`).

## Proveniência

- Upstream: orquestrador-native
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-13
- Evidências: `orquestrador/skills/skill-adr/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-adr/SKILL.md`](../../../orquestrador/skills/skill-adr/SKILL.md)
