---
name: skill-saas-factory
description: Build, refactor, review, or plan SaaS products with React/Vite, dashboards, admin panels, Supabase, payments, subscriptions, tenant limits, webhooks, security, infrastructure, and production readiness. Use as the top-level SaaS construction skill when work may need routing to payment, RLS, dashboard, limits, security scan, or deployment skills.
category: saas
risk: medium
source: local-project-patterns
---

# skill-saas-factory

## Default SaaS Base

When the user asks to create or modernize a SaaS and gives no narrower scope, treat the baseline product as:

1. Public landing page.
2. Registration/sign-up.
3. Login/sign-in.
4. Password recovery or magic-link flow when the auth provider supports it.
5. Onboarding/profile setup.
6. Authenticated app dashboard.
7. Billing/plan surface when a payment provider is present.
8. Admin dashboard for operators.
9. Security, analytics, and verification gates.

Do not build a marketing-only landing page when the user asked for a SaaS. The first usable app path must exist or be explicitly scoped out.

## Workflow

1. Discover the stack: package scripts, routes, auth provider, database schema/migrations, serverless/API boundaries, payment provider, env requirements, admin layout, and existing tests.
2. Classify the requested SaaS surface: public, auth, onboarding, app dashboard, admin, billing, analytics, security, or integrations.
3. Route to focused skills only when they add useful detail. Keep this file as the orchestration layer.
4. Preserve local patterns before adding architecture. Reuse existing clients, route groups, components, validation, migrations, and deployment conventions.
5. Implement the smallest coherent SaaS slice: database contract, backend enforcement, UI projection, audit trail, and verification.
6. Validate with the lightest meaningful gate available: typecheck, build, lint, focused tests, webhook simulation, security scan, or migration dry run.

## Public And Auth Surface

For new SaaS work, expect these screens unless the project already has equivalents:

- Landing: clear product promise, primary CTA to sign up, secondary CTA to sign in, social proof/pricing/FAQ only when useful.
- Sign up: email/password, OAuth, or magic link according to the existing auth provider; validate errors and duplicate-account states.
- Login: email/password/OAuth/magic link, forgot-password link, session persistence, clear auth errors.
- Password recovery: request reset, reset form, expired/invalid token state when supported.
- Onboarding: minimum profile/workspace setup, plan/trial state, first meaningful action, skip/complete status when appropriate.
- App dashboard: authenticated home with product-specific empty state, key metrics/actions, account/billing entry points.
- Admin dashboard: operator-only surface for users, tenants/workspaces, plans, payments, logs, support, settings.

Security rule: every protected screen needs a server/session/data access check. Hidden buttons or hidden routes are not access control.

## Surface-To-Skill Routing

- Landing, public pages, responsive UX, overflow, accessibility: `skill-frontend-ux-guardrails`.
- Modern app UI, component behavior, polished SaaS/admin patterns: `skill-modern-ui-patterns`.
- Open-design/tokens/visual QA/component library: `skill-open-design-ui`.
- Authenticated dashboard/admin/sidebar/metrics/users/plans/logs: `skill-saas-admin-dashboard`.
- Plan limits, trials, feature gates, onboarding completion, blocked states: `skill-saas-core-limits`.
- Product events, sign-up funnel, activation, conversion, billing analytics: `skill-unified-analytics`.
- Multiagent execution for full SaaS builds: `skill-multiagent-orchestration`.

## Routing

Open only the extra skill needed by the current task:
- Landing, login, registration, onboarding, responsive/product UX: `skill-frontend-ux-guardrails`.
- Modern SaaS UI composition and component states: `skill-modern-ui-patterns`.
- Visual design/tokens/component library workflow: `skill-open-design-ui`.
- Brazilian PIX/card checkout or AbacatePay billing: `skill-abacatepay-integration`.
- Stripe Checkout, Billing, subscriptions, or customer portal: `skill-stripe-integration`
- Admin/sidebar/dashboard/metrics/users/plans/logs UI: `skill-saas-admin-dashboard`.
- Limits, quotas, entitlements, feature flags, trials, grace periods: `skill-saas-core-limits`.
- Supabase RLS, tenant policies, storage policies: `skill-supabase-rls`.
- Sign-up activation, conversion events, product analytics, dashboard KPIs: `skill-unified-analytics`.
- Local defensive repository security scan: `skill-saas-security-scan`.
- DAST/recon against an owned staging URL: `skill-saas-dast-recon`.
- Git/CI safety gates: `skill-security-hooks`.
- Full SaaS work split across frontend/backend/security/tests: `skill-multiagent-orchestration`.

## Engineering Contract

1. Keep privileged work server-side. Never expose service-role keys, payment secrets, webhook secrets, provider API keys, or admin tokens to browser code.
2. Treat billing and entitlement state as backend/database truth. UI state is a projection and checkout redirects are advisory.
3. Use explicit database selects, tenant/user filters, RLS policies, indexes, idempotency keys, and event ledgers for async flows.
4. Add audit logs for manual admin actions, payment/entitlement transitions, security-sensitive changes, and automatic limit enforcement.
5. Validate request bodies and query params at the API boundary. Return structured errors without secrets or stack traces.
6. Prefer migrations and tests that prove access control, webhook idempotency, and dashboard query shape.
7. Treat auth flows as product-critical: handle loading, expired session, unauthorized, email confirmation, duplicate account, and recovery states.
8. Keep public landing analytics privacy-aware; do not collect sensitive form values or payment/auth secrets in event payloads.

## Minimum Acceptance Criteria

A new SaaS base is not complete until these are either implemented or explicitly out of scope:

- Landing page has working CTA routes to registration/login.
- Sign-up creates or requests an account using the project auth provider.
- Login establishes a session and redirects to the app dashboard.
- Protected dashboard rejects unauthenticated users.
- Onboarding captures the minimum data needed for the product or marks itself unnecessary.
- Admin routes are role-gated server-side.
- Billing UI only appears when provider/config/state exists.
- Empty, loading, error, unauthorized, and mobile states are handled.
- Typecheck/build/lint or the closest available validation command passes.

## Local References

Read only what the task needs:
- `references/project-patterns.md`: local JobTask, Nina, and Proposta Ninja conventions.
- `references/architecture.md`: SaaS module, database, frontend, and backend checklist.
- `references/payments.md`: provider selection, webhook, payment table, and entitlement checklist.
- `references/security-infra.md`: secrets, Supabase, API, and verification checklist.

