# OpenCode Rules

Keep this file small. The canonical operating contract lives in:

`{{USER_HOME}}/.orquestrador`

## Core Rules

- Prefer the smallest relevant context.
- Read the router before loading skills: `{{USER_HOME}}/.orquestrador\SKILLS_ROUTER.json`.
- Open only the specific `SKILL.md` files selected by the router.
- Use `{{USER_HOME}}/.opencode\skills` as the OpenCode skill root.
- Keep `{{USER_HOME}}/.agents\skills` populated for compatibility.
- Never remove shared roots unless explicitly requested.
- Verify before claiming completion.

## Token Discipline

- Do not paste full catalogs into prompts.
- Do not load `CATALOG.md`, giant hooks, or every skill unless doing a health audit.
- Prefer compact JSON indexes and direct file paths.
