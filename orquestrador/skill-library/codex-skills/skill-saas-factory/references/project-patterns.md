# Local SaaS Project Patterns

## JobTask

- Stack: Vite, React 18, TypeScript, Supabase, React Query, Zustand, React Router, Tailwind, MUI, Headless UI, Recharts, Playwright.
- Admin shape: dashboard metrics, user/client filters, trials, active subscribers, tasks/jobs, notifications, settings, users, payments.
- Supabase client: browser anon key only, PKCE auth, persisted session, project-specific storage key, realtime throttling.
- Security baseline: Supabase auth, RLS, secure uploads, session/inactivity protection, no sensitive logs.

## Nina

- Stack: Vite React TS plus Express/Netlify backend, Supabase, OpenAI/Gemini, PostHog, Socket.IO, Playwright.
- Strong backend boundary: `server/lib/supabase-admin.ts` keeps service-role access server-side.
- Payments: AbacatePay via Netlify functions/controllers, billing creation, webhook handling, partner links, plan duration, custom limits, payment receipts.
- Data discipline: explicit column selection, tenant context, idempotency/deduplication around operational payment evidence, migration-heavy RLS/performance work.

## Proposta Ninja

- Stack: frontend Vite React TS, backend Express, Supabase, helmet, rate-limit, express-validator, Pix/QrCode helpers, proposal/payment domain.
- Admin shape: layout sidebar, dashboard, users, plans, payments, logs, help, onboarding.
- Payment route pattern: backend validates query params, uses service-role Supabase client, normalizes legacy payment table shapes for admin views.

## Reusable Decisions

- Frontend should call project API/serverless functions for billing, never provider APIs directly with secrets.
- Admin dashboards should use stable route groups and compact nav: Dashboard, Users, Plans, Payments, Logs, Settings/Help.
- Payment and entitlement tables should tolerate provider retries, out-of-order events, refunds/cancellations, and manual review.
- Migrations must include RLS policies, indexes for dashboard queries, and explicit tenant/user access rules.
