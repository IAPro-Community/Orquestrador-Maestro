---
name: skill-cobranca-automatizada-saas-abacatepay
description: Automatic SaaS billing engine with AbacatePay (PIX + credit card), configurable dunning (regua de cobranca), trial management, invoice portal, email (Resend) and WhatsApp (Evolution API) notifications, admin CRUD, and billing metrics. Covers the full billing lifecycle from provisioning to collection.
category: saas
risk: high
source: nina-saas-production-code
---

# skill-cobranca-automatizada-saas-abacatepay

## When To Use

This skill covers the complete automated billing system ("cobranca automatizada") for Brazilian SaaS products using AbacatePay. Use when implementing or maintaining:

=== Provisioning ===
- Billing configuration tables (cobrancas, cobranca_reguas, billing_config, etc.)
- Dunning rule sequencing (cobranca_regua_eventos)
- Encrypted integration configs (Resend, Evolution API, AbacatePay)

=== Billing Engine ===
- Automated invoice generation and dunning execution via cron
- AbacatePay billing creation (PIX + CARD)
- Webhook processing with HMAC-SHA256 verification
- Invoice state machine (pending, paid, overdue, cancelled, refunded)
- Subscription/plan integration via cobranca_tracking

=== Trial Management ===
- Configurable trial duration
- Pre-expiration notifications (7/3/1 days before)
- Automatic trial expiration and account blocking

=== Interfaces ===
- Public invoice page (FaturaPage) with PIX QR Code, payment link, polling
- Pricing/Plans page with AbacatePay checkout
- User-side invoice listing (MinhasCobrancasSection)
- Admin billing management (cobranças CRUD, planos CRUD, global settings)
- Plan Manager (PlanManager) for user plan changes

=== Notifications ===
- Email via Resend with HTML templates (logo, badge, invoice details)
- WhatsApp via Evolution API with template variables
- Variables: {{nome}}, {{plano}}, {{valor}}, {{vencimento}}, {{link_pagamento}}, {{empresa_nome}}
- Dunning sequence: configurable events with days_apos_vencimento, channel (email/whatsapp/ambos)

## Architecture

```
                     +-------------------+
                     |   Cron (8/12/16h  |
                     |   BRT + 5min)     |
                     +--------+----------+
                              |
         +--------------------+--------------------+
         |                    |                    |
   Processar            Trial               Metrics
   Cobranças          Notificações          (meia-noite)
         |                    |
   +-----v------+      +-----v------+
   | Ver regua   |      | Trial exp. |
   | Send notif  |      | Notif pre  |
   | Create bill |      +------------+
   +-----+------+
         |
   +-----v------------------------------------------+
   |           Controller Layer                      |
   |  cobrancas.ts | abacatepay-webhook.ts           |
   |  fatura.ts    | trial.ts                        |
   +-----+----------------------------+--------------+
         |                            |
   +-----v----------+        +--------v---------+
   |  AbacatePay    |        |  Notifications    |
   |  API v2        |        |  Resend + Evol.  |
   +----------------+        +------------------+
         |
   +-----v----------+
   |  Supabase/     |
   |  PostgreSQL    |
   +----------------+
```

## Billing State Machine

```
pending ──► paid ──► refunded
  │
  ├──► overdue ──► paid
  │             └──► cancelled
  │
  └──► cancelled
```

States managed by `invoice-state-machine.ts`:
- `pending`: cobrança criada, aguardando pagamento
- `paid`: paga, `released_at` setado, conteúdo liberado
- `overdue`: vencida, entra na régua de cobrança
- `cancelled`: cancelada manualmente ou por expiração
- `refunded`: estornada (transição exclusiva de `paid`)

## Key Tables

| Table | Purpose |
|---|---|
| `cobrancas` | Core billing records per user |
| `cobranca_reguas` | Dunning rule sets per tenant |
| `cobranca_regua_eventos` | Individual dunning events in sequence |
| `billing_config` | Encrypted integration configs (Resend, Evolution, AbacatePay) |
| `front_users` | User profiles with plan and status |
| `partner_billing_config` | Partner-specific billing overrides |
| `cobranca_tracking` | Subscription-like recurring billing tracking |
| `transaction_log` | Billing operation audit log |
| `abacatepay_events` | Raw webhook event storage |

Full details in `billing-tables.md`.

## Core Flows

### Dunning Flow (Régua de Cobrança)
1. Cron runs billing-cron.ts at 8h/12h/16h BRT
2. Queries cobrancas WHERE status = 'overdue' AND NOT paga
3. For each cobranca, resolves billing_config + cobranca_regua + cobranca_regua_eventos
4. Checks if next evento should fire (based on dias_apos_vencimento)
5. Sends notification via billing-sender.ts (email + WhatsApp)
6. If all eventos fired and still overdue, marks as cancelled

### Webhook Flow
1. POST /api/abacatepay-webhook receives event
2. HMAC-SHA256 signature verification (replay + timing-safe compare)
3. Rate limited: 100 req/min per IP
4. On `billing.paid`: processPaymentWithTransaction updates cobranca + cobranca_tracking
5. On failure: processRollback reverts state
6. Raw event stored in abacatepay_events

### Trial Flow
1. trial-cron.ts runs every 5 minutes
2. Queries users where trial ends within notification window
3. Sends pre-expiration notifications (7/3/1 day before)
4. On expiration: blocks account (status = blocked)
5. billing-cron.ts also handles trial notifications at 8/12/16h

### Invoice Portal Flow
1. FaturaPage loads by shortlink (8 chars, unique)
2. Materializes billing from AbacatePay API on demand
3. Shows: PIX QR Code, payment link, due date, amount, status badge
4. Polls status every 5 seconds
5. "Share via WhatsApp" button with pre-formatted message

## Configuration

billing_config stores encrypted credentials per owner (AES-256-GCM):
- `resend_config`: Resend API key + from email
- `evolution_config`: Evolution API URL + API key + instance
- `abacatepay_config`: AbacatePay API key
- `trial_duration_days`: Trial length (default)
- Encryption key: BILLING_CONFIG_ENCRYPTION_KEY env var

See `billing-config.md` for full schema and setup.

## Guardrails

1. Keep ALL payment provider secrets server-side. Never expose AbacatePay API keys in browser bundles.
2. Process webhooks idempotently: check cobranca current state before mutating.
3. Treat checkout redirect as advisory. Grant access only after webhook confirmation.
4. Do not log API keys, webhook secrets, full CPF/CNPJ, full phone numbers.
5. Cron must not overlap. billing-cron uses lock checks to prevent concurrent runs.
6. Dunning notifications must respect channel preference (email, whatsapp, or ambos).
7. Trial expiration is irreversible: set status = blocked, do not auto-unblock without payment.
8. Metrics queries (MRR, faturamento) should use aggregateBillingMetrics(), not ad-hoc SQL.

## Local Reference (Nina)

This skill is extracted from the Nina SaaS billing system. The production codebase is at:

- `{{USER_HOME}}/Documents/Code/Nina/server/controllers/cobrancas.ts` — billing CRUD + processing + dunning
- `{{USER_HOME}}/Documents/Code/Nina/server/controllers/abacatepay-webhook.ts` — webhook handler
- `{{USER_HOME}}/Documents/Code/Nina/server/controllers/fatura.ts` — invoice lookup by shortlink
- `{{USER_HOME}}/Documents/Code/Nina/server/controllers/trial.ts` — trial expiration processing
- `{{USER_HOME}}/Documents/Code/Nina/server/services/abacatepay-create-billing-v2.ts` — AbacatePay billing creation
- `{{USER_HOME}}/Documents/Code/Nina/server/services/billing-sender.ts` — notification dispatch (email + WhatsApp)
- `{{USER_HOME}}/Documents/Code/Nina/server/services/billing-email-template.ts` — HTML invoice email template
- `{{USER_HOME}}/Documents/Code/Nina/server/services/billing-integrations-config.ts` — encrypted config management
- `{{USER_HOME}}/Documents/Code/Nina/server/services/billing-metrics.ts` — MRR and billing metrics
- `{{USER_HOME}}/Documents/Code/Nina/server/utils/invoice-state-machine.ts` — state machine logic
- `{{USER_HOME}}/Documents/Code/Nina/server/cron/billing-cron.ts` — main billing scheduler
- `{{USER_HOME}}/Documents/Code/Nina/server/cron/trial-cron.ts` — trial scheduler
- `{{USER_HOME}}/Documents/Code/Nina/src/pages/FaturaPage.tsx` — public invoice page
- `{{USER_HOME}}/Documents/Code/Nina/src/components/PlansPage.tsx` — pricing/plans page
- `{{USER_HOME}}/Documents/Code/Nina/src/components/PlanManager.tsx` — user plan manager
- `{{USER_HOME}}/Documents/Code/Nina/src/components/AdminCobrancas.tsx` — admin billing CRUD
- `{{USER_HOME}}/Documents/Code/Nina/src/components/AdminPlanos.tsx` — admin plan CRUD
- `{{USER_HOME}}/Documents/Code/Nina/src/components/AdminGlobalSettings.tsx` — global settings
- `{{USER_HOME}}/Documents/Code/Nina/src/components/MinhasCobrancasSection.tsx` — user invoice list
- `{{USER_HOME}}/Documents/Code/Nina/supabase/migrations/20260617_cobrancas_foundation.sql` — core tables
- `{{USER_HOME}}/Documents/Code/Nina/supabase/migrations/20260617_cobrancas_website_final.sql` — shortlink trigger
- `{{USER_HOME}}/Documents/Code/Nina/supabase/migrations/20240101_billing_config.sql` — billing_config table
- `{{USER_HOME}}/Documents/Code/Nina/supabase/migrations/20240117_partner_billing.sql` — partner billing

## Reference Files

- `billing-tables.md` — complete table schemas, indexes, enums, RLS policies
- `billing-flows.md` — detailed flow diagrams and pseudocode for each core flow
- `billing-config.md` — encryption, config resolution, and setup steps
- `billing-admin.md` — admin interfaces and CRUD operations
- `billing-notifications.md` — email/WhatsApp templates, dunning sequence, template variables

## Validation

- After changes, run build and typecheck (npm run build, npm run typecheck or equivalent)
- Simulate webhook: POST billing.paid event and verify idempotent processing
- Test dunning: create overdue cobranca with regua de 0/3/7 dias and confirm notification dispatch
- Test trial: set trial_duration_days=1, create user, wait for pre-expiration and expiration
- Verify no AbacatePay/Resend/Evolution keys leak to browser bundles
- Run project lint when available

## Related Skills

- `skill-abacatepay-integration` — AbacatePay API specifics (billing create, list, webhook)
- `skill-saas-core-limits` — plan limits, entitlements, feature flags after payment
- `skill-evolution-api` — WhatsApp notification channel
- `skill-supabase-rls` — RLS policies for billing tables
- `skill-saas-factory` — top-level SaaS construction entry
