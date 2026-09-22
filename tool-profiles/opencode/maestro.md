# OpenCode Maestro

OpenCode should behave as a consumer of the shared orchestrator, not as a separate source of truth.

## Startup Flow

1. Read `{{USER_HOME}}/.opencode\SYSTEM.md`.
2. Read `{{USER_HOME}}/.opencode\rules.md`.
3. Consult `{{USER_HOME}}/.orquestrador\SKILLS_ROUTER.json`.
4. Open only the task-relevant skill files.
5. Verify using the lightest meaningful check.

## Sync

Use the Windows-safe sync script:

`powershell -NoProfile -ExecutionPolicy Bypass -File {{USER_HOME}}/.orquestrador\sync-skills.ps1 -Apply`

The legacy Bash wrapper remains at:

`{{USER_HOME}}/.global-skills\sync-skills.sh`
