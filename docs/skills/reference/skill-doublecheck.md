<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-doublecheck

Verifica afirmações, fontes e risco de alucinação em respostas, pesquisas e documentos, com modo pontual ou contínuo.

| Campo | Valor |
| --- | --- |
| Categoria | verification |
| Risco | medium |
| Disponibilidade | Sob demanda |
| Tags | verification, doublecheck |
| Aliases | doublecheck |

## Melhores casos de uso

- Verifica afirmações, fontes e risco de alucinação em respostas, pesquisas e documentos, com modo pontual ou contínuo.

## Quando não usar

- Pedidos fora do domínio verification; use a skill específica quando houver uma intenção mais precisa.

## Exemplos de pedidos reconhecidos

- Use para verificar fontes.
- Use para confira as fontes.
- Use para isso está correto.
- Use para verifique essa resposta.
- Use para checagem factual.

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

- Recipe `research-and-decision`: Pesquisa com fontes e decisão registrada
- Chain `skill-doublecheck`

## Evidência mínima de conclusão

- Resultado solicitado demonstrado por teste, inspeção ou artefato verificável.
- Handoff com limitações e próximo passo quando aplicável.

Perfil de workflow: `standard` (entrada: `SKILL.md`).

## Proveniência

- Upstream: https://www.getclaudeskills.com/skills/doublecheck-github
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-13
- Evidências: `orquestrador/skills/skill-doublecheck/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-doublecheck/SKILL.md`](../../../orquestrador/skills/skill-doublecheck/SKILL.md)
