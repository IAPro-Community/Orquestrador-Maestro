<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-saas-security-scan

Authorized local SaaS repository security scan using maintained OSS tools.

| Campo | Valor |
| --- | --- |
| Categoria | security |
| Risco | high |
| Disponibilidade | Nativa |
| Tags | security, saas, scan |
| Aliases | security scan, scan seguranca, seguranca saas |

## Melhores casos de uso

- Authorized local SaaS repository security scan using maintained OSS tools.

## Quando não usar

- Scan ativo de URL/staging/produção; use skill-saas-dast-recon.
- Modelagem de ameaças arquitetural sem execução de scanners; use skill-threat-modeling.

## Exemplos de pedidos reconhecidos

- Use para saas security scan.
- Use para sast.
- Use para secrets.
- Use para dependency audit.
- Use para repo security.

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

- Recipe `payments-entitlements`: Pagamentos e sincronização de entitlement
- Recipe `release-readiness`: Preparação de release
- Recipe `security-review`: Revisão de segurança
- Chain `skill-multiagent-orchestration`
- Chain `skill-saas-factory`
- Chain `skill-saas-security-scan`
- Chain `skill-threat-modeling`

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
- Evidências: `orquestrador/skills/skill-saas-security-scan/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-saas-security-scan/SKILL.md`](../../../orquestrador/skills/skill-saas-security-scan/SKILL.md)
