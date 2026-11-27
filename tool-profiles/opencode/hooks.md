# opencode routing guidance

This is textual guidance, not a registered executable hook. For non-trivial work needing specialized skills, use `orquestrador-maestro route explain --compact --json "task summary"` in the project directory (or reuse a hook-provided route). Pass the summary as a safely quoted argument, never as shell code. Open only selected skill bodies. Do not load full routing JSON catalogs into model context. If the CLI is unavailable, use native skill discovery or a relevant index excerpt.

For substantive or resumed work, follow the nearest project instructions and hydrate relevant DEV control files: `DEV/AGENTS.md` when present, `DEV/README.md` or `DEV/INDEX.md`, `DEV/HANDOFF.md`, `DEV/CONTEXT.md`, `DEV/SPECS/ACTIVE.md`. Reuse still-valid session context; read additional files only as needed. Mechanical tasks need no broad DEV hydration unless required by project instructions.
