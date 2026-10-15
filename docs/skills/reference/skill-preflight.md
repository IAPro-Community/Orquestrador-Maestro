<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-preflight

Preflight de escopo, baseline, riscos, ownership e testes.

| Campo | Valor |
| --- | --- |
| Categoria | workflow |
| Risco | medium |
| Disponibilidade | Nativa |
| Tags | workflow, preflight |
| Aliases | preflight |

## Melhores casos de uso

- Preflight de escopo, baseline, riscos, ownership e testes.

## Quando não usar

- Execução da implementação depois que escopo e baseline já estão claros.
- Operação mecânica de baixo risco que não exige análise prévia.

## Exemplos de pedidos reconhecidos

- Use para preflight.
- Use para pre-flight.
- Use para antes de implementar.

## Pré-requisitos e ferramentas externas

- Contexto do projeto e autorização compatíveis com o risco medium.

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

- Recipe `secure-saas-build`: Construção segura de SaaS
- Chain `skill-scope-control`

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
- Evidências: `orquestrador/skills/skill-preflight/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-preflight/SKILL.md`](../../../orquestrador/skills/skill-preflight/SKILL.md)
