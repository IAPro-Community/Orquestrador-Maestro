# SKILL.md Template v2 (1.1.0)

Canonical authoring standard for `orquestrador/skills/*/SKILL.md`. Generated scaffolds must satisfy `scripts/skill-catalog.js validate`; this template adds the progressive-disclosure and trigger rules the validator does not yet enforce (enforcement tracked for 1.2.0).

## Frontmatter (closed set, no extra fields without RFC)

```yaml
---
name: skill-example
description: One line, EN or PT, ending with the primary outcome.
category: orchestration   # architecture|automation|database|frontend|governance|orchestration|review|saas|security|...
risk: low                 # low|medium|high
source: orquestrador-native  # orquestrador-native|local-pattern|upstream-url|adapted-external
---
```

- `risk: high` requires `last_verified: YYYY-MM-DD` (recent review date).
- `source: upstream-url` requires `license:` and `upstream:` lines in manifest provenance (see `skill-scope-control`).

## Body (required sections, in order)

```md
# Skill Example

Use when <5 short sentences, EN+PT mixed allowed>.

## Workflow (≤7 steps)

1. ...
2. ...

## Guardrails

- ...

## Verification

- ...

## References

- `references/detail.md` — long procedures, matrices, examples.
```

## Progressive disclosure

- `SKILL.md` **≤120 lines**. Anything longer moves to `references/*.md` and is linked from `## References`.
- Rationale: the router loads `SKILL.md` bodies into context; 228-line skills (pre-1.1.0 `skill-cobranca-automatizada-saas-abacatepay`) cost tokens on every match. Split candidates: billing state-machine/dunning/webhook, design-profile/visual-qa.

## Triggers

- Lowercase PT-BR normalized (the catalog applies `normalizeTrigger`; write triggers already normalized).
- No generic one-word triggers (`pix`, `supabase`, `saas`) without a qualified alias.
- Never duplicate the same token in `triggers` and `aliases` of one skill.
- Deprecated skills keep `status: deprecated` + `redirect:` in the manifest and a deprecation notice as the first body block.

## Scaffolding

Prefer `scripts/new-canonical-skill.sh` (or `.ps1`) over hand-writing frontmatter; then run `node scripts/skill-catalog.js generate` + `validate`.
