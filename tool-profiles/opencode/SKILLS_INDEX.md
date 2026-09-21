# OpenCode Skills Index

This index is intentionally compact to reduce token use.

## Router First

Use these compact files before loading skill catalogs:

`{{USER_HOME}}/.orquestrador/SKILL_EXECUTION_PROFILES.json`

`{{USER_HOME}}/.orquestrador/SKILL_ALIASES.json`

`{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`

`{{USER_HOME}}/.orquestrador/SKILL_CHAINS.json`

Open only the relevant skill files after routing.

## Skill Roots

| Purpose | Path |
|---|---|
| OpenCode active skills | `{{USER_HOME}}/.opencode/skills` |
| Compatibility skills | `{{USER_HOME}}/.agents/skills` |
| Codex skills | `{{USER_HOME}}/.codex/skills` |
| Canonical orchestrator skills | `{{USER_HOME}}/.orquestrador/skills` |
| Global skill mirror | `{{USER_HOME}}/.global-skills` |

## Security Automation

| Need | Skill |
|---|---|
| Build or review a SaaS product | `/skill:skill-saas-factory` |
| SaaS admin dashboard | `/skill:skill-saas-admin-dashboard` |
| AbacatePay PIX/card billing | `/skill:skill-abacatepay-integration` |
| Stripe subscriptions/checkout | `/skill:skill-stripe-integration` |
| Plan limits and entitlements | `/skill:skill-saas-core-limits` |
| Local SaaS repository security scan | `/skill:skill-saas-security-scan` |
| Authorized staging or preview DAST/recon | `/skill:skill-saas-dast-recon` |
| Git hooks and CI security gates | `/skill:skill-security-hooks` |
| Supabase RLS and tenant isolation | `/skill:skill-supabase-rls` |
| AI provider routing and token budget | `/skill:skill-ai-orchestration` |
| Multiagent/subagent orchestration | `/skill:skill-multiagent-orchestration` |
| AionUi cowork/team orchestration | `/skill:skill-aionui-cowork-orchestration` |
| WhatsApp via Evolution API | `/skill:skill-evolution-api` |
| Frontend UX guardrails | `/skill:skill-frontend-ux-guardrails` |
| Modern SaaS UI patterns | `/skill:skill-modern-ui-patterns` |
| Open-design UI workflow | `/skill:skill-open-design-ui` |
| Premium web experience strategy and orchestration | `/skill:skill-premium-web-experience` |
| Live media processing | `/skill:skill-live-processing` |
| Manual video processing | `/skill:skill-manual-video-processing` |
| Smart clip detection | `/skill:skill-smart-clip-detection` |
| Unified analytics | `/skill:skill-unified-analytics` |
| ElevenLabs voice integration | `/skill:skill-elevenlabs-voice-cloning` |
| Google Workspace sync | `/skill:skill-google-workspace-sync` |

## Maintenance

Sync:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/sync-skills.ps1 -Apply`

Doctor:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/doctor.ps1`
