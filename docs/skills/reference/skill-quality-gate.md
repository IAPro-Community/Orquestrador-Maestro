<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-quality-gate

Avalia skills, plugins e MCPs antes da adoção.

| Campo | Valor |
| --- | --- |
| Categoria | governance |
| Risco | high |
| Disponibilidade | Nativa |
| Tags | governance, quality, gate |
| Aliases | quality gate, skill gate |

## Melhores casos de uso

- Avalia skills, plugins e MCPs antes da adoção.

## Quando não usar

- Verificação de conclusão de uma tarefa comum; use skill-verification-before-completion.
- Diagnóstico geral de saúde do repositório; use skill-repo-health.

## Exemplos de pedidos reconhecidos

- Use para quality gate.
- Use para skill gate.
- Use para avaliar skill.
- Use para auditar plugin.

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

- Nenhuma recipe registrada.
- Chain `skill-skill-development`

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
- Evidências: `orquestrador/skills/skill-quality-gate/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-quality-gate/SKILL.md`](../../../orquestrador/skills/skill-quality-gate/SKILL.md)
