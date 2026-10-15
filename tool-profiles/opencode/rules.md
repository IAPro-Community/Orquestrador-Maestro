# OpenCode Rules

Keep this file small. The canonical operating contract lives in:

`{{USER_HOME}}/.orquestrador`

## Core Rules

- Prefer the smallest relevant context.
- Read the router before loading skills: `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`.
- Open only the specific `SKILL.md` files selected by the router.
- Use `{{USER_HOME}}/.opencode/skills` as the OpenCode skill root.
- Keep `{{USER_HOME}}/.agents/skills` populated for compatibility.
- Never remove shared roots unless explicitly requested.
- Verify before claiming completion.

## Token Discipline

- Do not paste full catalogs into prompts.
- Do not load `CATALOG.md`, giant hooks, or every skill unless doing a health audit.
- Prefer compact JSON indexes and direct file paths.

## Windows and Path Safety

- In PowerShell, resolve the canonical root with `$orquestradorRoot = Join-Path $HOME '.orquestrador'`. Spell the folder exactly `.orquestrador`.
- Check paths with `Test-Path -LiteralPath` and build child paths with `Join-Path` before reading or writing. If a path is missing, inspect `$HOME`; never create a near-spelling folder to work around a failed lookup.
- Use PowerShell commands such as `Get-ChildItem -Force -LiteralPath` and `Get-Content -Raw`, `-Tail`, or `-TotalCount`. POSIX options such as `ls -la` and commands such as `tail` or `head` do not work in PowerShell.
- Use the exact skill slug from `SKILLS_ROUTER.json` and read its `SKILL.md` from the configured skill root. Do not invent a skill name after a failed lookup.
- Only create or edit a skill when the maestro asks for it. Treat `SKILLS_MANIFEST.json` as JSON; never append free text with `echo >>`.
