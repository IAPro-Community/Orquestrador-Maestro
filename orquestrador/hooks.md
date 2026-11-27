# Orquestrador Hooks

This file must stay compact. It is a hook router, not a skill catalog.

## Preflight

For substantive, resumed or uncertain project work, follow the nearest project instructions and read relevant DEV control files: `DEV/AGENTS.md` when present, `DEV/README.md` or `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, and `DEV/SPECS/ACTIVE.md`. Reuse still-valid session context; mechanical tasks need no broad DEV hydration unless project instructions require it.

For non-trivial work needing specialized skills, run `orquestrador-maestro route explain --compact --json "task summary"` locally in the project directory (or reuse an existing hook-provided route). Safely quote the summary as data. Open only the selected skill bodies. Never load a full routing catalog into model context. If the CLI is unavailable, use native skill discovery or a relevant index excerpt.

## Token Budget

- In `fast`, load one skill body.
- In `standard`, load at most three skill bodies.
- In `deep`, `saas`, or `security`, expand only when the execution profile and `SKILL_CHAINS.json` allow it.
- Keep trigger logic in `SKILLS_ROUTER.json`; do not duplicate large trigger tables here.
- Summarize durable findings into `DEV/WORKLOG.md`, `DEV/VERIFY.md`, and `DEV/HANDOFF.md` instead of rereading the same files later.
- If `DEV/WORKLOG.md` grows beyond the project's compact limit, run `orquestrador-maestro compact-worklog --project-path <project> --keep 12`.
- For long tasks, run `orquestrador-maestro check-dev-gates --project-path <project> --max-entries 12 --strict` before declaring handoff readiness.

## Adaptive Resolution (Shadow)

- When the Runtime receives measured or deterministic evidence candidates, let `runtime/resolution` rank optional evidence before future context expansion.
- V0 is advisory only: it must not block or alter the existing execution or context path.
- Optimize observed cost to a hard validated outcome; never fabricate token, latency, evidence, or context metrics.

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
