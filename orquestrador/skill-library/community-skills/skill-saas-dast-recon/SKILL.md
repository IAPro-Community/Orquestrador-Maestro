---
name: skill-saas-dast-recon
description: Run defensive, explicitly authorized SaaS DAST and recon with scope controls. Use when asked to scan an owned local, staging, preview, or approved production URL, API endpoint, SaaS app, tenant boundary, public web surface, auth flow, exposed files, headers, TLS, or OWASP Top 10 behavior using tools such as ZAP, Nuclei, Katana, httpx, and Subfinder.
category: security
risk: high
source: owasp-zap-projectdiscovery
---

# skill-saas-dast-recon

## Authorization gate

Only run this skill against systems the user owns or is explicitly authorized to test. If scope is unclear, ask for:

- Target base URL.
- Allowed environment: local, staging, preview, or production.
- In-scope hosts, paths, and tenants.
- Out-of-scope paths, hosts, tenants, and destructive actions.
- Whether active checks are allowed.

Default to passive/baseline scans. Production scans must use low rate limits and avoid destructive, brute-force, or fuzzing templates.

## Core workflow

1. Record the target, environment, scope, and authorization statement in the final report.
2. Validate the target is an explicit `http://` or `https://` URL provided by the user.
3. Start with passive checks:
   - HTTP headers and TLS.
   - Exposed files and known misconfigurations.
   - Baseline ZAP scan only when a pinned or explicitly approved Docker image is configured.
4. Crawl only within the provided base URL.
5. Use Nuclei with severity filters and conservative rate limits:
   - Prefer maintained `projectdiscovery/nuclei-templates`.
   - Use tags/severities instead of running every template against production.
6. Keep raw results in `security-reports/dast/`.
7. Summarize reproducible findings, false-positive risk, affected URLs, tenant impact, and remediation.

## Default command

```bat
"{{USER_HOME}}/.orquestrador/skills/skill-saas-dast-recon/scripts/saas-dast-recon.cmd" https://staging.example.com --i-own-this-target
```

## Severity and gates

- Critical: confirmed auth bypass, cross-tenant data access, exposed secrets, unauthenticated admin access, or exploit with sensitive data impact. Stop and report immediately.
- High: reproducible IDOR, SQL/command injection, dangerous CORS, missing access control on sensitive endpoints, or exposed backup/config files. Block release.
- Medium: missing security headers, weak cookies, verbose errors, rate-limit gaps, exposed metadata without secrets. Require ticketed remediation.
- Low/Info: fingerprinting, minor header gaps, informational exposure. Track without blocking.

For active DAST, stop after the first critical finding unless the user explicitly asks to continue within scope.

## SaaS-specific checks

- Tenant boundary leaks: URLs with workspace, org, user, invoice, subscription, or project IDs.
- Auth transitions: login, logout, magic links, OAuth callbacks, password reset, invitation acceptance.
- CORS and cookies: wildcard origins, missing `HttpOnly`, missing `Secure`, weak `SameSite`.
- Public files: `.env`, source maps, build manifests, logs, backup files, admin routes.
- Headers: CSP, HSTS, X-Frame-Options or `frame-ancestors`, Referrer-Policy, Permissions-Policy.
- Rate limiting: login, signup, password reset, webhooks, public API endpoints.
- API behavior: IDOR, broken object/property authorization, over-broad CORS, verbose errors, exposed source maps.

## Bundled resources

- Read `references/repository-catalog.md` when choosing or updating DAST tools.
- Run `scripts/saas-dast-recon.cmd` with an explicit authorization flag.

## Source baseline

- OWASP ZAP for passive/baseline web application checks.
- ProjectDiscovery Nuclei and `nuclei-templates` for template-based checks.
- OWASP ASVS and OWASP API Security guidance for interpreting findings.

## Hard stops

- Do not run credential stuffing, brute force, destructive fuzzing, exploit templates, or state-changing attacks without explicit written approval in the current task.
- Do not bypass authentication or access another tenant's data unless the user provided a controlled test tenant pair.
- Do not follow redirects to third-party domains unless they are explicitly in scope.

