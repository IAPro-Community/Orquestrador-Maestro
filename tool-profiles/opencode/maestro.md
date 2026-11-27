# OpenCode Maestro

OpenCode should behave as a consumer of the shared orchestrator, not as a separate source of truth.

## Startup Flow

Apply the shared `~/AGENTS.md` contract only if it is not already loaded. For non-trivial work needing specialized skills, run `orquestrador-maestro route explain --compact --json "task summary"` locally in the project directory (or reuse an existing hook-provided route). Safely quote the summary as data. Open only the selected skill bodies. Never load a full routing catalog into model context. If the CLI is unavailable, use native skill discovery or a relevant index excerpt.

For substantive, resumed or uncertain project work, follow the nearest project instructions and read relevant DEV control files: `DEV/AGENTS.md` when present, `DEV/README.md` or `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, and `DEV/SPECS/ACTIVE.md`. Reuse still-valid session context; mechanical tasks need no broad DEV hydration unless project instructions require it.

Verify proportionally without starting another session.

## Sync

Use the Windows-safe sync script:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador/sync-skills.ps1 -Apply`

The legacy Bash wrapper remains at:

`{{USER_HOME}}/.global-skills/sync-skills.sh`
