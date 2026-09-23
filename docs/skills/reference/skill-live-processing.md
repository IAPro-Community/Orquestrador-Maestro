<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-live-processing

Live media processing pipeline with capture, queueing, worker state, retries, and observability.

| Campo | Valor |
| --- | --- |
| Categoria | media |
| Risco | medium |
| Disponibilidade | Sob demanda |
| Tags | media, live, processing |
| Aliases | live video, processamento ao vivo |

## Melhores casos de uso

- Live media processing pipeline with capture, queueing, worker state, retries, and observability.

## Quando não usar

- Upload manual/VOD sem ingestão live; use skill-manual-video-processing.
- Seleção de melhores trechos a partir de conteúdo já processado; use skill-smart-clip-detection.

## Exemplos de pedidos reconhecidos

- Use para live processing.
- Use para processamento ao vivo.
- Use para stream processing.
- Use para live video.
- Use para fila de video.

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

- Recipe `media-processing`: Processamento de mídia
- Chain `skill-live-processing`

## Evidência mínima de conclusão

- Resultado solicitado demonstrado por teste, inspeção ou artefato verificável.
- Handoff com limitações e próximo passo quando aplicável.

Perfil de workflow: `standard` (entrada: `SKILL.md`).

## Proveniência

- Upstream: local-media-patterns
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-13
- Evidências: `orquestrador/skills/skill-live-processing/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-live-processing/SKILL.md`](../../../orquestrador/skills/skill-live-processing/SKILL.md)
