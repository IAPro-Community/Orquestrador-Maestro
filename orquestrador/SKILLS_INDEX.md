# Orquestrador Skills Index

This index is intentionally compact. Use it to find the router, not as a full catalog.

## Router First

Read these compact files before loading skill catalogs:

`{{USER_HOME}}/.orquestrador\SKILL_EXECUTION_PROFILES.json`

`{{USER_HOME}}/.orquestrador\SKILL_ALIASES.json`

`{{USER_HOME}}/.orquestrador\SKILLS_ROUTER.json`

`{{USER_HOME}}/.orquestrador\SKILL_CHAINS.json`

`{{USER_HOME}}/.orquestrador\SKILLS_MANIFEST.json`

Then open only the selected `SKILL.md` files and their directly referenced files.

## Canonical Skill Roots

| Purpose | Path |
|---|---|
| Canonical orchestrator skills | `{{USER_HOME}}/.orquestrador\skills` |
| Codex active skills | `{{USER_HOME}}/.codex\skills` |
| Claude active skills | `{{USER_HOME}}/.claude\skills` |
| OpenCode active skills | `{{USER_HOME}}/.opencode\skills` |
| Legacy compatibility skills | `{{USER_HOME}}/.agents\skills` |
| Antigravity skills | `{{USER_HOME}}/.antigravity-skills\skills` |

## High-Value Routes

| Need | Skill |
|---|---|
| Build or review a SaaS product | `/skill:skill-saas-factory` |
| SaaS admin dashboard | `/skill:skill-saas-admin-dashboard` |
| AbacatePay PIX/card billing | `/skill:skill-abacatepay-integration` |
| Stripe subscriptions/checkout | `/skill:skill-stripe-integration` |
| Plan limits and entitlements | `/skill:skill-saas-core-limits` |
| Supabase RLS | `/skill:skill-supabase-rls` |
| Local SaaS repository security scan | `/skill:skill-saas-security-scan` |
| Authorized staging/preview DAST | `/skill:skill-saas-dast-recon` |
| Git hooks and CI security gates | `/skill:skill-security-hooks` |
| Supabase RLS and tenant isolation | `/skill:skill-supabase-rls` |
| AI provider routing and token budget | `/skill:skill-ai-orchestration` |
| Multiagent/subagent orchestration | `/skill:skill-multiagent-orchestration` |
| AionUi cowork/team orchestration | `/skill:skill-aionui-cowork-orchestration` |
| WhatsApp via Evolution API | `/skill:skill-evolution-api` |
| Frontend UX guardrails | `/skill:skill-frontend-ux-guardrails` |
| Modern SaaS UI patterns | `/skill:skill-modern-ui-patterns` |
| Open-design UI workflow | `/skill:skill-open-design-ui` |
| Conversational Impeccable frontend routing | `/skill:skill-impeccable` |
| Diff and change scope control | `/skill:skill-scope-control` |
| Claims and source verification | `/skill:skill-doublecheck` |
| STRIDE-A threat modeling | `/skill:skill-threat-modeling` |
| Skill creation and maintenance | `/skill:skill-skill-development` |
| Live media processing | `/skill:skill-live-processing` |
| Manual video processing | `/skill:skill-manual-video-processing` |
| Smart clip detection | `/skill:skill-smart-clip-detection` |
| Video evidence, OCR, timestamps, and visual-flow proof | `/skill:skill-watch-evidence` |
| Unified analytics | `/skill:skill-unified-analytics` |
| ElevenLabs voice integration | `/skill:skill-elevenlabs-voice-cloning` |
| Google Workspace sync | `/skill:skill-google-workspace-sync` |
| Automated billing (AbacatePay, dunning, trial) | `/skill:skill-cobranca-automatizada-saas-abacatepay` |
| WhatsApp Meta Ads leads | `/skill:skill-whatsapp-meta-ads-leads` |
| Quality gate for external skills/plugins/MCPs | `/skill:skill-quality-gate` |
| Repository health and onboarding diagnosis | `/skill:skill-repo-health` |
| Preflight before implementation | `/skill:skill-preflight` |
| Systematic debugging | `/skill:skill-systematic-debugging` |
| Verification before completion | `/skill:skill-verification-before-completion` |
| Web E2E and visual regression testing | `/skill:skill-webapp-testing` |
| Build secure MCP servers | `/skill:skill-mcp-builder` |
| Generate deep technical wiki | `/skill:skill-deep-wiki` |
| Agent observability and evaluation | `/skill:skill-agent-observability` |
| Release engineering and rollback | `/skill:skill-release-engineering` |
| Safe database migrations | `/skill:skill-database-migrations` |
| Dependency upgrades | `/skill:skill-dependency-upgrade` |
| Incident response | `/skill:skill-incident-response` |
| Architecture decision records | `/skill:skill-adr` |
| Web research and synthesis | `/skill:skill-research-and-synthesis` |

## Maintenance

Sync shared skills to Codex, Claude, OpenCode, Antigravity, and compatibility roots:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador\sync-skills.ps1 -Apply`

Run health checks:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador\doctor.ps1`
