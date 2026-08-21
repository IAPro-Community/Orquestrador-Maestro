# ADR 0001 - Architecture First Gate by risk class

## Status

Accepted - 2026-07-20

## Context

The Orquestrador already ships the pieces for "think before you code": `deep-interview`
(Socratic interview with quantitative ambiguity gating), `skill-preflight` (scope, impact,
failure modes, ownership, minimal verification), and `skill-adr` (formal decision records).
It also ships a light pre-code contract via `DEV/SPECS/ACTIVE.md` validated by
`check-dev-gates`. The weakness was enforcement, not existence: these mechanisms were
available but optional, and the risk taxonomy that should trigger them lived only inside the
`plan` skill's `--deliberate` trigger list (auth/security, migrations, destructive changes,
production incidents, compliance/PII, public API breakage).

## Decision

Promulgate the existing mechanisms as gates routed by risk class, without adding new
universal artifacts:

1. `SKILLS_ROUTER.json` gains a `riskClasses` block (trivial, local, structural, integration,
   security-compliance, domain-critical) derived from the `plan` deliberate triggers. The four
   high-risk classes require `deep-interview` + `skill-preflight` + `skill-adr` before code
   edits. `SKILL_CHAINS.json` gains a matching `mandatoryPreCode` chain. `deep-interview` is
   added to the router registry so the requirement resolves to a real skill.
2. `DEV/SPECS/ACTIVE.md` gains a `## Structural Prevention` section (change class + the
   structural adjustment that prevents recurrence). `check-dev-gates --strict` now also
   requires substantive `Out Of Scope` and `Structural Prevention` content.
3. `check-dev-gates --architectural` (implies `--strict`) enforces a declared change class and,
   for high-risk classes, recorded preflight evidence plus a substantive ADR.
4. A `check-recurrence` command detects a file/module/topic touched across N (default 3)
   worklog entries and writes `DEV/REPEATED_FAILURES.md` to open causal investigation. The
   gate warns on hotspots in every mode and blocks in `--architectural` when unacknowledged.

## Drivers

- Enforcement proportional to risk, not universal ceremony (preserve token economy).
- Reuse existing skills and artifacts; do not proliferate mandatory files.
- Make architecture and root-cause work precede patching for high-risk changes.

## Alternatives considered

- Seven new universal artifacts (PRODUCT_GOAL, DOMAIN/RULES, ARCH/ACTIVE, CHANGE/REQUEST, ...).
  Rejected: dead boilerplate in small projects, pollutes the context the project economizes.
- Model Spec adherence evals (probabilistic). Deferred: the deterministic `--architectural`
  gate is the cheap 80% and must exist first to show where the agent leaks.

## Consequences

- The default gate stays backward compatible; existing projects are not broken. New rigor is
  opt-in via `--strict` / `--architectural` and via the router policy.
- Override is allowed but must be explicit and recorded ("proceed with warning"), never
  inferred from task content.

## Verification

- `node --check`, `JSON.parse` on both routers/chains, `bash -n` on the template.
- 8-case fixture: default passes; strict catches empty Out Of Scope and Structural Prevention;
  architectural requires preflight + ADR for a structural change; recurrence detection writes
  the file and hard-fails architectural when unacknowledged.
- Round-trip integrity: templatize(local router) equals the repo snapshot router.

## Follow-ups

- Wire `riskClasses` into the `plan` skill's auto-classification so the router taxonomy and the
  `plan --deliberate` triggers share one source of truth.
- Item 6 (Model Spec adherence evals) once the deterministic gate has run in anger.
