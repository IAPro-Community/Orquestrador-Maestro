---
name: skill-frontend-excellence
description: "Use for product frontend work: classify intent, discover the project's design system and Design Profile, preserve or evolve UI, run Visual QA, and refuse to mark frontend done from build-only evidence."
category: frontend
risk: medium
source: orquestrador-native
---

# Frontend Excellence

Use this as the **process** layer for product UI. It does not own design-system tokens or application brand.

```text
Design system  = source of truth (components, tokens, themes, patterns)
This skill     = process (intent, creativity, preserve vs redesign, DoD)
Application    = product context (configured Design Profile)
Visual QA      = smoke evidence
Maestro        = orchestration / retries
Router         = discovery / invocation
```

Do not copy design-system documentation into this skill. Locate live metadata via `adapters/design-system.md` or the project's configured adapter.

This skill is for **product surfaces** (admin, authentication, portals, forms, tables). For cinematic marketing sites use `skill-premium-web-experience`. For a single visual polish pass use `skill-impeccable`. This skill coordinates those instead of replacing them.

## Composition and precedence

Use one owner for each concern:

| Concern | Primary owner | Delegation rule |
|---|---|---|
| Intent, posture, Design Profile, and Definition of Done | `skill-frontend-excellence` | Always load for product-frontend work. |
| Brand direction or a new visual language | `skill-open-design-ui` | Load only for explicit exploration or a requested visual system. |
| Component states, interaction patterns, and polish | `skill-modern-ui-patterns` | Load when the task changes interaction behavior or state coverage. |
| Responsive/accessibility usability gate | `skill-frontend-ux-guardrails` | Load for a UX gate or when responsive/accessibility risk is material. |
| Browser flow and E2E evidence | `skill-webapp-testing` | Load for a critical user journey or browser regression. |
| One-off conversational visual polish | `skill-impeccable` | Use instead of open-design for a bounded polish pass. |
| Cinematic marketing experience | `skill-premium-web-experience` | It owns the strategy for marketing surfaces; do not also treat this skill as the top-level owner. |

When more than one downstream skill applies, load at most two for a standard task. The top-level intent and Definition of Done remain owned here.

## When to load

Natural-language requests such as:

- modernize esta tela
- migre MUI, Bootstrap ou outro design system para o sistema adotado pelo projeto
- melhore este formulário
- corrija o mobile
- refatore este frontend
- crie uma tela nova

Also load when the user asks for Visual QA, Design Profile, or frontend Definition of Done.

## Step 0 — Classify intent (mandatory)

Derive, do not ask unless two intents are equally likely:

| Intent | Typical verbs |
|---|---|
| CREATE | crie, adicione, nova tela, novo fluxo |
| REDESIGN | modernize, redesenhe, nova identidade |
| IMPROVE | melhore, refine, acessibilidade, mobile |
| MIGRATE | migre MUI/Bootstrap ou outro design system para o sistema adotado pelo projeto |
| REFACTOR | refatore, TypeScript, router, performance |
| FIX | corrija, bug, overflow, contraste |
| REVIEW | revise, audite, critique |

Posture:

| Posture | Meaning |
|---|---|
| PRESERVE | Visual change not requested is a regression |
| EVOLVE | Local UX change inside existing identity |
| EXPLORE | New composition is allowed after directions |

Creativity (`NONE|LOW|MEDIUM|HIGH`) comes from the request **and** the application Design Profile. The stricter of the two wins.

Gold rule: **refactor is not redesign**. `MIGRATE`, `REFACTOR`, library upgrades, and React/router/TypeScript work default to `PRESERVE + NONE`.

Run `scripts/classify-intent.mjs` when available. Read only the matching workflow:

- [CREATE](workflows/create.md)
- [REDESIGN](workflows/redesign.md)
- [IMPROVE](workflows/improve.md)
- [MIGRATE / REFACTOR](workflows/migrate.md)
- [FIX](workflows/fix.md)
- [REVIEW](workflows/review.md)

## Step 1 — Resolve the design system (mandatory)

Run `node scripts/discover-design-system.mjs <project-root>` and persist its structured result.
Only `status: resolved` with confidence `>= 0.80` permits new visual implementation. For
`ambiguous` or `unresolved`, stop with `BLOCKED_REQUIRES_USER_DECISION`; ask whether to preserve
local components, use a named project system, or explicitly propose a new visual base. Never
choose by package popularity or model preference.

## Step 2 — Load context

1. Application Design Profile: use the project's configured file, package export, or the bundled neutral fallback. Do not assume a repository layout.
2. Design-system metadata via the adapter. Never invent components.
3. Existing routes, tokens, i18n, tests, and startup commands from the app.
4. If PRESERVE: capture baseline screenshots **before** editing.

## Step 3 — Implement under the right workflow

- CREATE → `workflows/create.md`
- REDESIGN + HIGH → `workflows/redesign.md` (directions before code)
- IMPROVE → `workflows/improve.md`
- MIGRATE / REFACTOR + PRESERVE → `workflows/migrate.md`
- FIX → `workflows/fix.md`
- REVIEW → `workflows/review.md`

Engineering, visual, accessibility, responsive, and maintainability rules are in [standards](standards/).

## Step 4 — Visual QA is part of the work

Build passing is not done. Run the checklist in [validation/definition-of-done.md](validation/definition-of-done.md), with smoke details in [validation/visual.md](validation/visual.md) and [validation/accessibility.md](validation/accessibility.md).

Preferred command (the path is relative to this skill package):

```bash
node scripts/visual-qa.mjs --url <app-url> --out .frontend-excellence/visual-qa/
```

Viewports default to the shared smoke widths: `390`, `768`, `1280`, `1440`.

Hard failures (any one fails the task):

- console / page errors
- contrast below WCAG AA for normal text (`4.5:1`) except a documented design-system exception
- missing accessible name on controls
- page-level overflow on required viewports
- PRESERVE: unintended visual delta vs baseline

This is a smoke harness, not a complete WCAG audit. Score (`validation/visual.md`) never overrides a hard failure; use the project's accessibility tooling for certification.

## Step 5 — Independent visual review

Produce structured findings even if the same agent implements:

```yaml
id: UI-001
severity: high
viewport: 390x844
component: LoginPanel
problem: Insufficient text contrast.
expected: WCAG AA 4.5:1
actual: measured or approximated ratio
action: Use a semantic text token that meets AA.
```

Do not conclude with “ficou bonito” or “ficou profissional”.

## Guardrails

- Never force every app to look the same. A design system is vocabulary; the Design Profile is identity.
- Never recreate a design-system component. Search metadata first.
- Never start REDESIGN+HIGH by writing components. Produce 2–3 genuinely different directions first.
- Never mark frontend complete from compile/lint alone.
- Never overwrite uncommitted human work.
- Prefer the project's documented package subpath imports when the app already does; do not introduce a barrel that the tree-shaking contract forbids.
- Delegate visual craft to `skill-open-design-ui`, interaction states to `skill-modern-ui-patterns`, UX gate to `skill-frontend-ux-guardrails`, E2E to `skill-webapp-testing`.

## Related Skills

- `skill-open-design-ui`
- `skill-modern-ui-patterns`
- `skill-frontend-ux-guardrails`
- `skill-webapp-testing`
- `skill-impeccable`
- `skill-premium-web-experience`
- `skill-verification-before-completion`
- `skill-browser-agent`

## Verification

- Intent, posture, and creativity are written down before the first UI edit.
- Design-system metadata was consulted (or the adapter recorded that no supported system was found).
- Design Profile was loaded or explicitly recorded as missing.
- Visual QA artifacts exist under the project's configured output directory or the skill fixture run.
- Definition of Done checklist is complete for the intent.
