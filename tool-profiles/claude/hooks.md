# Claude Hooks

This file is textual routing guidance, not a registered Claude Code executable hook or a skill catalog. Follow it through the global CLAUDE.md; actual hooks require separate explicit configuration and trust.

1. Read project `AGENTS.md`.
2. If `DEV/` exists, read `DEV/README.md` or `DEV/INDEX.md`, then only the task-relevant `DEV/` files.
3. Read `{{USER_HOME}}/.orquestrador/SKILL_EXECUTION_PROFILES.json`.
4. Read `{{USER_HOME}}/.orquestrador/SKILL_ALIASES.json`.
5. Read `{{USER_HOME}}/.orquestrador/SKILLS_ROUTER.json`.
6. Read `{{USER_HOME}}/.orquestrador/SKILL_CHAINS.json` only after selecting the primary skill.
7. Open only the selected `SKILL.md` files and only the files directly referenced by them.
8. Do not use this file, `SKILLS_INDEX.md`, or `community-skills/` as a full discovery catalog.
9. In `fast`, load one skill body. In `standard`, load at most three. Go wider only if the execution profile and the skill chain allow it.
10. Verify before claiming completion.
11. For broad global changes, run `orquestrador-maestro doctor --strict`. Linux/macOS can use the portable verifier without PowerShell.
