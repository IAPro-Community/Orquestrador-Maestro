<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-manual-video-processing

Manual upload video processing with secure storage, validation, job states, and retryable workers.

| Campo | Valor |
| --- | --- |
| Categoria | media |
| Risco | medium |
| Disponibilidade | Sob demanda |
| Tags | media, manual, video, processing |
| Aliases | upload video, processar video |

## Melhores casos de uso

- Manual upload video processing with secure storage, validation, job states, and retryable workers.

## Quando não usar

- Captura/ingestão de livestream; use skill-live-processing.
- Somente análise de momentos ou evidência temporal de mídia já disponível; use skill-watch-evidence.

## Exemplos de pedidos reconhecidos

- Use para manual video.
- Use para upload video.
- Use para processar video.
- Use para video processing.
- Use para transcode.

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
- Chain `skill-manual-video-processing`

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
- Evidências: `orquestrador/skills/skill-manual-video-processing/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-manual-video-processing/SKILL.md`](../../../orquestrador/skills/skill-manual-video-processing/SKILL.md)
