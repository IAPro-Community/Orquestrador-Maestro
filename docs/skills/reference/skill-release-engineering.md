<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-release-engineering

Engenharia de release, smoke tests, rollback e checklist operacional.

| Campo | Valor |
| --- | --- |
| Categoria | delivery |
| Risco | high |
| Disponibilidade | Nativa |
| Tags | delivery, release, engineering |
| Aliases | release engineering |

## Melhores casos de uso

- Engenharia de release, smoke tests, rollback e checklist operacional.

## Quando não usar

- Commit ou PR comum sem preparação de release.
- Deploy experimental que não representa uma release versionada.

## Exemplos de pedidos reconhecidos

- Use para release engineering.
- Use para preparar release.
- Use para rollback.

## Pré-requisitos e ferramentas externas

- Contexto do projeto e autorização compatíveis com o risco high.

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

- Recipe `release-readiness`: Preparação de release
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
- Evidências: `orquestrador/skills/skill-release-engineering/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-release-engineering/SKILL.md`](../../../orquestrador/skills/skill-release-engineering/SKILL.md)
