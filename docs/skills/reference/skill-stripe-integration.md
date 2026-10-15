<!-- GENERATED FILE: scripts/skill-catalog.js; DO NOT EDIT. -->
# skill-stripe-integration

Stripe Checkout, Billing subscriptions, customer portal, webhook verification, and SaaS entitlement sync.

| Campo | Valor |
| --- | --- |
| Categoria | payments |
| Risco | medium |
| Disponibilidade | Sob demanda |
| Tags | payments, stripe, integration |
| Aliases | stripe, checkout |

## Melhores casos de uso

- Stripe Checkout, Billing subscriptions, customer portal, webhook verification, and SaaS entitlement sync.

## Quando não usar

- Fluxo PIX/CPF/CNPJ específico da AbacatePay.
- Motor completo de cobrança recorrente independente do provider.

## Exemplos de pedidos reconhecidos

- Use para stripe.
- Use para stripe checkout.
- Use para stripe billing.
- Use para customer portal.
- Use para invoice.paid.

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

- Recipe `payments-entitlements`: Pagamentos e sincronização de entitlement
- Chain `skill-saas-factory`

## Evidência mínima de conclusão

- Resultado solicitado demonstrado por teste, inspeção ou artefato verificável.
- Handoff com limitações e próximo passo quando aplicável.

Perfil de workflow: `standard` (entrada: `SKILL.md`).

## Proveniência

- Upstream: local-payment-patterns
- Versão: bundled
- Licença: repository-license
- Steward: orquestrador-maintainers
- Revisado em: 2026-09-13
- Evidências: `orquestrador/skills/skill-stripe-integration/SKILL.md`

## Fonte canônica

[`orquestrador/skills/skill-stripe-integration/SKILL.md`](../../../orquestrador/skills/skill-stripe-integration/SKILL.md)
