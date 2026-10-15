# OpenCode Global Orquestrador

Use this file as the global OpenCode rule file for this user.

Always apply the Orquestrador Maestro contract:

1. Read `{{USER_HOME}}/AGENTS.md`.
2. Read `{{USER_HOME}}/.orquestrador/rules.md`.
3. Read `{{USER_HOME}}/.orquestrador/maestro.md`.
4. Read `{{USER_HOME}}/.orquestrador/PERSISTENCE.md`.
5. In projects with `DEV/`, read the project DEV overview after the nearest project `AGENTS.md`.
6. Use `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json` before loading task skills.
7. Load only the task-relevant `SKILL.md` files and task-relevant `DEV/` docs.
8. Keep durable project docs in `DEV/` by default and update `DEV/WORKLOG.md` after substantive work.
9. Treat the IA as `orquestrador` and the user as `maestro`.
10. Verify before claiming completion.
11. Do not commit or push unless the user explicitly asks.

Default skill: `orquestrador-maestro`.

## Windows and Path Safety

- In PowerShell, resolve the canonical root with `$orquestradorRoot = Join-Path $HOME '.orquestrador'`. Spell the folder exactly `.orquestrador`.
- Check paths with `Test-Path -LiteralPath` and build child paths with `Join-Path` before reading or writing. If a path is missing, inspect `$HOME`; never create a near-spelling folder to work around a failed lookup.
- Use PowerShell commands such as `Get-ChildItem -Force -LiteralPath` and `Get-Content -Raw`, `-Tail`, or `-TotalCount`. POSIX options such as `ls -la` and commands such as `tail` or `head` do not work in PowerShell.
- Use the exact skill slug from `SKILLS_ROUTER.json` and read its `SKILL.md` from the configured skill root. Do not invent a skill name after a failed lookup.
- Only create or edit a skill when the maestro asks for it. Treat `SKILLS_MANIFEST.json` as JSON; never append free text with `echo >>`.
