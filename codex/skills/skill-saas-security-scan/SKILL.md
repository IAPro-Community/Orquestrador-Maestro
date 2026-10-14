---
name: skill-saas-security-scan
description: Run defensive, authorized local security scans for owned SaaS repositories. Use when asked to scan local code, dependencies, secrets, containers, IaC, API handlers, Supabase projects, multi-tenant SaaS isolation, or release/security gates with maintained OSS tools such as Semgrep, Gitleaks, Trivy, OSV-Scanner, and OWASP Dependency-Check.
category: security
risk: medium
source: owasp-semgrep-gitleaks-trivy
---

# skill-saas-security-scan

## Authorization gate

Use only on local repositories the user owns or is explicitly authorized to assess. Before running scans, record:

- Repository path.
- Authorization statement from the current task.
- Whether the run is advisory or blocking.

Do not scan third-party targets from this skill. Use `skill-saas-dast-recon` for authorized URLs.

## Core workflow

1. Confirm the repository path is local, exists, and is authorized.
2. Prefer read-only scans. Do not mutate dependencies, lockfiles, source, or secrets.
3. Run the lightest meaningful checks first:
   - `gitleaks detect --redact` for git-history and working-tree secrets.
   - `semgrep scan` with OWASP and secrets rules for SAST.
   - `osv-scanner`, package-manager audit, or `trivy fs` for vulnerable dependencies.
   - `trivy config` or `trivy fs --scanners vuln,secret,misconfig` for IaC, container config, SBOM, CVE, and secret coverage.
   - `npm audit --audit-level=moderate` only when a Node lockfile exists.
4. Store raw results under `security-reports/`.
5. Triage findings by severity, affected file, exploitability, tenant impact, and fix path.
6. Treat scanner output as evidence, not proof. Manually verify high-impact findings before claiming they are exploitable.

## Default command

```bat
"{{USER_HOME}}/.orquestrador/skills/skill-saas-security-scan/scripts/saas-security-scan.cmd" "C:/path/to/repo" --authorized-local-repo
```

## Severity and gates

- Critical: confirmed secrets, remote code execution, auth bypass, service-role exposure, cross-tenant data access, or public write access to sensitive data. Block release.
- High: reproducible injection, IDOR, missing RLS on exposed tables, unsafe webhook verification, vulnerable critical dependency with reachable code path. Block merge until fixed or formally risk-accepted.
- Medium: missing rate limits, weak headers, excessive permissions, dependency CVEs without confirmed reachability, unsafe defaults. Require ticketed remediation.
- Low/Info: hardening, stale packages, defense-in-depth improvements. Track without blocking.

For local gates, block only confirmed critical/high findings. Do not block on missing optional local tools; CI should provide the enforceable gate.

## SaaS-specific review focus

- Secrets in `.env`, logs, CI files, examples, frontend bundles, Docker build args, and Supabase config.
- Broken tenant isolation: missing `tenant_id`, missing RLS, unsafe admin bypass, broad service-role usage.
- Auth/session errors: weak cookie flags, JWT trust without issuer/audience validation, insecure OAuth callbacks.
- Billing and plan enforcement: client-side-only limits, missing webhook signature checks, replayable events.
- API abuse: missing rate limits, permissive CORS, mass assignment, IDOR, SSRF, unsafe file uploads.
- Supply chain: unpinned GitHub Actions, untrusted install scripts, mutable container tags, risky postinstall scripts.
- ASVS-inspired baseline: auth, session, access control, validation, cryptography, error handling, logging, SSRF, file handling, API, and configuration checks.

## Bundled resources

- Read `references/repository-catalog.md` when choosing or updating the toolchain.
- Run `scripts/saas-security-scan.cmd` from a repository root on Windows.

## Source baseline

Prefer maintained primary sources when refreshing this skill:

- OWASP ASVS 5.x for web application verification categories.
- OWASP Cheat Sheet Series for focused practices such as authentication, authorization, secrets, file uploads, SSRF, and logging.
- Semgrep Registry and `semgrep/semgrep-rules` for SAST rules.
- Gitleaks for local, git history, stdin, and pre-commit secret scanning.
- Trivy for filesystem, repository, container, IaC, SBOM, vulnerability, license, and secret scanning.

## Safety rules

- Do not upload private source to hosted scanners unless the user explicitly approves.
- Do not auto-fix dependencies or rotate secrets without a separate explicit request.
- Do not print secret values. Keep redaction enabled and summarize only fingerprints, file paths, or scanner IDs.

