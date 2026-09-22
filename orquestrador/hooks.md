# Orquestrador Hooks

This file must stay compact. It is a hook router, not a skill catalog.

## Preflight

Before broad work:

1. Read project `AGENTS.md`.
2. If `DEV/` exists, read `DEV/README.md` or `DEV/INDEX.md`, then `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, and `DEV/SPECS/ACTIVE.md` before opening any long project history.
3. Read `{{USER_HOME}}/.orquestrador/SKILL_EXECUTION_PROFILES.json`.
4. Read `{{USER_HOME}}/.orquestrador/SKILL_ALIASES.json`.
5. Read `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`.
6. Read `{{USER_HOME}}/.orquestrador/SKILL_CHAINS.json` only after selecting the primary skill.
7. Open only the selected `SKILL.md` files and only the files directly referenced by them.
8. Do not use this file, `SKILLS_INDEX.md`, or `skill-library/community-skills/` as a full discovery catalog.

## Token Budget

- In `fast`, load one skill body.
- In `standard`, load at most three skill bodies.
- In `deep`, `saas`, or `security`, expand only when the execution profile and `SKILL_CHAINS.json` allow it.
- Keep trigger logic in `SKILLS_ROUTER.json`; do not duplicate large trigger tables here.
- Summarize durable findings into `DEV/WORKLOG.md`, `DEV/VERIFY.md`, and `DEV/HANDOFF.md` instead of rereading the same files later.
- If `DEV/WORKLOG.md` grows beyond the project's compact limit, run `orquestrador-maestro compact-worklog --project-path <project> --keep 12`.
- For long tasks, run `orquestrador-maestro check-dev-gates --project-path <project> --max-entries 12 --strict` before declaring handoff readiness.

## Verification

Before claiming completion:

1. Run the lightest meaningful validation.
2. For code changes, prefer build, lint, and tests when available.
3. For broad global changes, run `powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/doctor.ps1` when PowerShell is available.

## Sync

After adding or changing a shared skill:

- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/sync-skills.ps1 -Apply`
- Linux/macOS: `bash {{USER_HOME}}/.orquestrador/sync-skills.sh --apply`

## Control Files

- `{{USER_HOME}}/.orquestrador/PROGRAM_ENTRYPOINTS.json`
- `{{USER_HOME}}/.orquestrador/SKILL_EXECUTION_PROFILES.json`
- `{{USER_HOME}}/.orquestrador/SKILL_ALIASES.json`
- `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`
- `{{USER_HOME}}/.orquestrador/SKILL_CHAINS.json`
- `{{USER_HOME}}/.orquestrador/SKILL_USAGE_SCHEMA.json`
