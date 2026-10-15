<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-dependency-upgrade

Atualização controlada de dependências e lockfiles.

| Campo | Valor |
| --- | --- |
| Categoria | maintenance |
| Risco | medium |
| Disponibilidade | Sob demanda |
| Tags | maintenance, dependency, upgrade |
| Aliases | upgrade dependências |

## Melhores casos de uso

- Atualização controlada de dependências e lockfiles.

## Quando não usar

- Feature nova sem mudança de dependência.
- Atualização de versão do próprio produto/release sem upgrade de dependências.

## Exemplos de pedidos reconhecidos

- Use para dependency upgrade.
- Use para atualizar dependencias.
- Use para upgrade dependencias.

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

- Nenhuma recipe registrada.
- Chain `skill-engineering-quality`

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
- Evidências: `orquestrador/skills/skill-dependency-upgrade/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-dependency-upgrade/SKILL.md`](../../../orquestrador/skills/skill-dependency-upgrade/SKILL.md)
