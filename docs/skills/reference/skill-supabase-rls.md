<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-supabase-rls

Supabase/Postgres RLS design, tenant isolation, policies, indexes, and verification.

| Campo | Valor |
| --- | --- |
| Categoria | security |
| Risco | high |
| Disponibilidade | Sob demanda |
| Tags | security, supabase, rls |
| Aliases | supabase, rls, tenant isolation |

## Melhores casos de uso

- Supabase/Postgres RLS design, tenant isolation, policies, indexes, and verification.

## Quando não usar

- Autorização genérica sem Supabase/Postgres RLS.
- Migração de banco sem mudança de política de acesso; use skill-database-migrations.

## Exemplos de pedidos reconhecidos

- Use para supabase.
- Use para rls.
- Use para row level security.
- Use para tenant isolation.
- Use para policies.

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

- Recipe `secure-saas-build`: Construção segura de SaaS
- Recipe `security-review`: Revisão de segurança
- Chain `skill-saas-factory`
- Chain `skill-saas-security-scan`
- Chain `skill-supabase-rls`
- Chain `skill-threat-modeling`

## Evidência mínima de conclusão

- Resultado solicitado demonstrado por teste, inspeção ou artefato verificável.
- Handoff com limitações e próximo passo quando aplicável.

Perfil de workflow: `standard` (entrada: `SKILL.md`).

## Proveniência

- Upstream: local-supabase-patterns
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-13
- Evidências: `orquestrador/skills/skill-supabase-rls/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-supabase-rls/SKILL.md`](../../../orquestrador/skills/skill-supabase-rls/SKILL.md)
