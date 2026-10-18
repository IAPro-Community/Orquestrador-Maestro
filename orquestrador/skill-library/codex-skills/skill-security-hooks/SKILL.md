---
name: skill-security-hooks
description: Install and maintain defensive security hooks and CI gates for authorized SaaS projects. Use when asked to add pre-commit hooks, pre-push hooks, CI security scans, GitHub Actions hardening, secret scanning, dependency scanning, SAST, DAST gates, or security automation around existing repositories.
category: security
risk: medium
source: owasp-gitleaks-semgrep-trivy
---

# skill-security-hooks

## Authorization gate

Only install hooks in a repository the user owns or has explicitly authorized. Before editing hook config, inspect existing hooks and CI so you do not replace project-specific behavior.

Record:

- Repository path.
- Existing `core.hooksPath`, `.git/hooks`, `.githooks`, pre-commit framework, Husky, Lefthook, or CI workflows.
- Whether the user wants advisory local hooks or blocking gates.

## Core workflow

1. Inspect the project stack and existing hooks before adding anything.
2. Preserve existing hooks. If a hook already exists, merge behavior or stop and ask before overwriting.
3. Keep pre-commit fast: confirmed secrets and lightweight static checks only.
4. Put slower dependency, container, IaC, and DAST scans in pre-push, PR CI, or scheduled CI.
5. Pin GitHub Actions by commit SHA when practical, not mutable tags.
6. Keep production DAST opt-in, scoped, and low rate.
7. Store scanner outputs in `security-reports/` and keep secrets out of logs.
8. Prefer local hooks for fast feedback and CI for enforceable gates.

## Default command

```bat
"{{USER_HOME}}/.orquestrador/skills/skill-security-hooks/scripts/install-security-hooks.cmd" "C:/path/to/repo" --authorized-local-repo
```

## Hook policy

- Pre-commit: run secret scan only. It should be fast and block obvious leaked credentials.
- Pre-push: run local SaaS security scan when the repo has scanner tools installed.
- CI pull request: run SAST, SCA, IaC, and secret scanning.
- Scheduled CI: run broader dependency and DAST baseline scans against staging.
- Release gate: require clean critical/high triage, not necessarily zero informational findings.

## Severity and gates

- Block commit: confirmed secrets in staged changes.
- Block push: confirmed high/critical secrets, reachable high/critical SAST issues, or high/critical dependency findings from installed tools.
- Block merge: critical/high CI findings unless documented as false positive or formally risk-accepted.
- Do not block local work because optional scanner binaries are missing. Print the skipped tool and rely on CI for enforcement.

## Bundled resources

- Use `scripts/install-security-hooks.cmd` from the repository root to install local Git hooks.
- Read `references/github-actions-security.yml` when adding CI gates.
- Pair with `skill-saas-security-scan` for local scans and `skill-saas-dast-recon` for authorized URL scans.

## Tool baseline

- Gitleaks in pre-commit or PR CI for secrets.
- Semgrep in PR CI for SAST.
- Trivy or OSV-Scanner for dependency/container/IaC coverage.
- ZAP baseline and conservative Nuclei templates on owned staging/preview URLs.

## Failure handling

- Block commits on confirmed secrets.
- Block merges on critical/high findings unless the finding is documented as a false positive.
- Do not print secret values. Keep redaction enabled.
- Do not install package managers, global tools, or CI workflows without explicit approval.

