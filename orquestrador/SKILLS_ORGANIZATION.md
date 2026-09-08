# Skills Organization

Use this as the operating model for shared local skills.

## Principles

- `{{USER_HOME}}/.orquestrador\skills` is the canonical source for custom skills.
- `{{USER_HOME}}/.orquestrador\SKILLS_ROUTER.json` is the first file agents should read.
- `{{USER_HOME}}/.orquestrador\SKILLS_MANIFEST.json` is the canonical registry for managed skills and sync behavior.
- `{{USER_HOME}}/.orquestrador\SKILL_ALIASES.json` maps user wording to canonical skill names.
- `{{USER_HOME}}/.orquestrador\SKILL_CHAINS.json` controls which skills may be chained together.
- `{{USER_HOME}}/.orquestrador\SKILL_EXECUTION_PROFILES.json` controls max skill loading and validation depth.
- `{{USER_HOME}}/.orquestrador\skill-library\community-skills` is the full community library kept outside native scanned roots.
- `{{USER_HOME}}/.orquestrador\skill-library\codex-skills` is the full OMX/Codex workflow catalog kept outside the native Codex root.
- Agent roots such as `.codex`, `.claude`, `.opencode`, `.agents`, `.cursor`, `.gemini`, `.windsurf`, and `.antigravity-skills` are minimal native mirrors.
- Do not edit native mirrors by hand unless debugging; edit canonical skills and run sync.
- Keep skill bodies concise. Put heavy details under `references/` only when needed.

## Categories

| Category | Purpose |
|---|---|
| `saas` | SaaS construction, limits, dashboards, payments, tenant workflows |
| `payments` | Provider-specific billing, checkout, webhook and entitlement sync |
| `security` | RLS, scans, hooks, DAST, secrets, dependency checks |
| `frontend` | UI systems, admin dashboards, UX guardrails, design patterns |
| `ai` | OpenAI/Gemini/audio/image orchestration and cost controls |
| `orchestration` | Multiagent routing, AionUi cowork, delegation, ownership, integration, and token control |
| `communication` | WhatsApp, webhooks, messaging automation |
| `media` | Live ingestion, uploads, clipping, video/audio processing |
| `analytics` | Events, funnels, dashboards, attribution, metric contracts |
| `integrations` | External systems such as Google Workspace |

## Skill Quality Bar

Every custom skill should have:

- YAML frontmatter with `name`, `description`, `category`, `risk`, and `source`.
- A strong `description` that says when to use the skill.
- A compact workflow that starts with the minimum safe action.
- Guardrails for secrets, destructive operations, privacy, billing, and production systems when relevant.
- Verification steps that fit the risk level.
- Related skills as plain names when they should be chained.
- No TODO, stub, placeholder, or broken UTF-8 text.
- No known stale API examples when provider docs have changed.
- Source notes when the skill depends on a fast-moving ecosystem or security tool.

## Automatic Invocation Contract

Agents should treat `SKILLS_ROUTER.json` as the automatic invocation layer:

1. Read the user request and project context.
2. Choose an execution profile.
3. Match aliases and router triggers before loading any full skill body.
4. Start from one top-level skill when possible, especially `skill-saas-factory`.
5. Chain provider-specific skills only when the task touches that provider and `SKILL_CHAINS.json` allows it.
6. Use `skill-multiagent-orchestration` when the user asks for subagents/multiagents or when independent lanes clearly reduce time or risk.
7. Use `skill-aionui-cowork-orchestration` when AionUi, cowork agents, Team Mode, or unified MCP/agent UI is in scope.
8. Prefer local repository evidence over broad catalog loading.
9. Append a usage log entry when the tool supports it.
10. Run `doctor.ps1` after global skill or hook changes.

## Premium Web Composition

`skill-premium-web-experience` is the top-level experience strategy and coordination layer for premium web surfaces:

```text
skill-premium-web-experience
        |
        +-- skill-open-design-ui           visual system, tokens, visual QA
        +-- skill-modern-ui-patterns       components, states, interaction details
        +-- skill-frontend-ux-guardrails   final UX/accessibility/responsive gate
        +-- skill-impeccable                focused critique and polish
        +-- skill-browser-agent            public reference research and validation
        +-- skill-multiagent-orchestration  independent lanes only when justified
        +-- skill-saas-factory               larger SaaS context when applicable
```

The premium skill owns business discovery, narrative, visual direction, scroll-story decisions, motion strategy, conversion structure and final coordination. Downstream skills keep their specialized responsibilities and must not replace that experience brief. `scroll-experience` is an optional capability: use it only when installed and exposed by the environment; it is not registered as a duplicate in this catalog. Without it, implement progressively enhanced scroll behavior with a clear static reading path.

## Current External Baselines

Refresh security and SaaS skills against primary sources:

- OWASP ASVS 5.x for application security verification.
- OWASP Cheat Sheet Series for focused implementation guidance.
- Supabase RLS docs for browser-safe database access and policy behavior.
- Stripe and AbacatePay docs for payment/webhook behavior.
- Semgrep rules/registry, Gitleaks, Trivy, ZAP, Nuclei, and nuclei-templates for scanning workflows.

## Improvement Workflow

1. Create the canonical skill with the helper when possible:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\new-canonical-skill.ps1 -Name "skill-example" -Description "Use for ..." -Category "ai" -Risk "medium" -Trigger "example" -Alias "exemplo" -MirrorEverywhere`

2. Edit the generated `SKILL.md` and keep the body compact.
3. Update `SKILL_CHAINS.json` only when the new skill should be chained by existing skills.
4. Run the catalog validation:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-skills.ps1`

5. Sync mirrored roots:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador\sync-skills.ps1 -Apply`

6. Run:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador\doctor.ps1`

7. Before publishing the snapshot, run:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-public.ps1`

The `mirrorEverywhere` field in `SKILLS_MANIFEST.json` controls whether `sync-skills.ps1` and `sync-skills.sh` copy a skill into the minimal native roots used by Codex, Claude, OpenCode, Cursor, Gemini, Windsurf, Antigravity, and legacy compatibility paths.
