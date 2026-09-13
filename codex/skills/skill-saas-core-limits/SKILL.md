---
name: skill-saas-core-limits
description: Implement SaaS plan limits, quotas, entitlements, feature flags, trials, grace periods, blocked accounts, usage counters, and access checks after AbacatePay, Stripe, webhook, or manual admin subscription changes.
category: saas
risk: medium
source: local-saas-entitlement-patterns
---

# skill-saas-core-limits

## Workflow

1. Identify the billable actor: user, tenant, workspace, account, organization, or project.
2. Inventory gated features and usage counters. Classify each as hard limit, soft limit, feature flag, trial-only feature, admin override, or informational banner.
3. Model entitlements independently from payment provider objects. Store provider IDs as evidence, not as the product access model.
4. Enforce important limits server-side, in RPC, or through RLS. Use frontend checks only for early feedback.
5. Make usage updates atomic when races are possible.
6. Add audit logs for payment sync, admin overrides, blocked states, automatic deactivation, and limit resets.
7. Verify transitions with focused tests, SQL checks, or manual scenarios.

## Data Model

- `plans`: code, display name, active flag, currency, price, interval, feature limits JSON.
- `entitlements`: actor ID, plan ID, status, starts_at, ends_at, grace_until, provider, provider IDs, override fields.
- `usage_counters`: actor ID, feature key, period start/end, used count, hard limit, reset policy.
- `audit_logs`: actor, action, before/after, reason, source, correlation ID.

## Status Contract

- Subscription/access states: `trialing`, `active`, `grace`, `past_due`, `cancelled`, `expired`, `blocked`.
- Usage states: `ok`, `caution`, `warning`, `limit_reached`, `expired`.
- Suggested thresholds: `caution` at 70%, `warning` at 90%, `limit_reached` at 100%.

## Guardrails

1. Do not grant or revoke access from a checkout success redirect alone.
2. Do not trust frontend counters for enforcement.
3. Do not scatter plan logic across UI components. Centralize in backend services, RPC, or shared domain helpers.
4. Do not block paid users silently. Return actionable errors and show upgrade/recovery paths.
5. Keep grace-period and cancellation policy explicit; do not infer it from provider defaults.

## Local Reference

For a concrete local pattern, inspect `{{USER_HOME}}/Documents\Code\Nina\src\lib\planLimitChecker.ts` only when implementing similar Supabase/RPC usage checks.

## Related Skills

- `skill-saas-factory`
- `skill-abacatepay-integration`
- `skill-stripe-integration`
- `skill-supabase-rls`

