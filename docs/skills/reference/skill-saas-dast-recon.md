<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-saas-dast-recon

Authorized staging/preview DAST and recon workflow for owned SaaS systems.

| Campo | Valor |
| --- | --- |
| Categoria | security |
| Risco | high |
| Disponibilidade | Sob demanda |
| Tags | security, saas, dast, recon |
| Aliases | dast, nuclei, owasp zap |

## Melhores casos de uso

- Authorized staging/preview DAST and recon workflow for owned SaaS systems.

## Quando não usar

- Scan local de código, dependências, secrets ou IaC; use skill-saas-security-scan.
- Alvo externo sem autorização explícita.

## Exemplos de pedidos reconhecidos

- Use para dast.
- Use para preview scan.
- Use para staging scan.
- Use para nuclei.
- Use para authorized url scan.

## Pré-requisitos e ferramentas externas

- Contexto do projeto e autorização compatíveis com o risco high.

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
- Chain `skill-saas-security-scan`

## Evidência mínima de conclusão

- Resultado solicitado demonstrado por teste, inspeção ou artefato verificável.
- Handoff com limitações e próximo passo quando aplicável.

Perfil de workflow: `standard` (entrada: `SKILL.md`).

## Proveniência

- Upstream: local-security-patterns
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-13
- Evidências: `orquestrador/skills/skill-saas-dast-recon/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-saas-dast-recon/SKILL.md`](../../../orquestrador/skills/skill-saas-dast-recon/SKILL.md)
