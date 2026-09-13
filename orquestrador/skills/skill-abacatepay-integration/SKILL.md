---
name: skill-abacatepay-integration
description: Integrate AbacatePay PIX/card billing, customers, QRCode PIX, billing webhooks, CPF/CNPJ validation, BRL SaaS checkout, payment receipts, refunds, cancellations, and entitlement sync for Brazilian SaaS products.
category: payments
risk: medium
source: official-docs-plus-local-saas-patterns
last_verified: 2026-08-06
---

# skill-abacatepay-integration

## Workflow

1. Inspect the project backend boundary first: Netlify/Vercel function, Express route, server action, Edge Function, or other server-only layer.
2. Keep all AbacatePay calls behind that backend boundary. Browser code calls the project API, never AbacatePay directly with secrets.
3. Validate customer data before billing creation: email, cellphone with country code, CPF/CNPJ without punctuation, amount in cents, plan ID, and tenant/user identity.
4. Create billing with stable metadata: `user_id`, `tenant_id`, `plan_id`, internal correlation ID, and payment link token when present.
5. Persist provider IDs, normalized status, amount, currency, raw event reference, and support/debug timestamps.
6. Process webhooks idempotently, update entitlements from trusted backend evidence, and audit every access transition.
7. Verify with local webhook tooling or provider test events plus project build/typecheck.

## Current API Shape (v2)

Use API v2 for new work. API v1 remains only for legacy integrations:
- base URL: `https://api.abacatepay.com/v2`
- hosted checkout: `POST /checkouts/create`
- subscriptions: `POST /subscriptions/create`
- transparent PIX/card/boleto checkout: `POST /transparents/create`
- webhook management: `POST /webhooks/create`
- auth header: `Authorization: Bearer <abacatepay-api-key>`
- current checkout events: `checkout.completed`, `checkout.refunded`, `checkout.disputed`
- current subscription events: `subscription.completed`, `subscription.renewed`, `subscription.cancelled`

The old v1 routes such as `/v1/billing/create` and events such as `billing.paid` are legacy-compatible references. Do not copy them into new integrations; if maintaining v1, isolate an adapter and plan migration to v2.

## Guardrails

1. Keep `ABACATEPAY_API_KEY` and webhook secrets server-side.
2. Treat checkout redirect as advisory. Grant access only after trusted backend/webhook confirmation.
3. Deduplicate webhook processing by the v2 event ID and the provider checkout/subscription ID.
4. Do not log API keys, webhook secrets, full CPF/CNPJ, full phone numbers, or unnecessary PII.
5. Keep plan and entitlement rules in local product tables, not encoded only in AbacatePay objects.
6. Support retries and out-of-order delivery by re-reading local payment state before mutation.

## Local Pattern

The Nina project has a useful boundary pattern: frontend client calls a Netlify function, the function uses the server API key and service-role Supabase client, and the webhook updates users/plans after `billing.paid`.

Read `{{USER_HOME}}/Documents\Code\Nina\src\lib\abacatepay.ts` only when implementing a similar client boundary or validating local conventions.

## Validation

- Confirm no `ABACATEPAY_API_KEY` or webhook secret appears in browser bundles or `VITE_` variables.
- Simulate or replay `billing.paid` and confirm idempotent entitlement update.
- Check invalid CPF/CNPJ, invalid cellphone, duplicate webhook, expired billing, and failed provider response paths.
- Run the project build/typecheck/lint when available.
- Confirm the integration uses the v2 payload shape (`apiVersion: 2`) and does not assume the legacy `billing.*` event names.

## Official References

- https://docs.abacatepay.com/pages/reference/introduction
- https://docs.abacatepay.com/pages/payment/create
- https://docs.abacatepay.com/pages/webhooks
- https://docs.abacatepay.com/pages/changelog

## Related Skills

- `skill-saas-factory`
- `skill-saas-core-limits`
- `skill-supabase-rls`
- `skill-security-hooks`
